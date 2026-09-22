import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/config/settings";
import {
  derivarCondicoes,
  planejarAlertas,
  JANELA_REMONTAGENS_DIAS,
  type JobSnapshot,
  type MaquinaSnapshot,
} from "@/lib/alerts/engine";
import { getSmtpConfig, getTelegramConfig } from "@/lib/config/integracoes";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Avaliador de alertas (a cada 1 min).
 *
 * Lê o estado, delega a decisão ao motor puro e aplica o plano. Toda a
 * inteligência (dedupe, correlação) está em @/lib/alerts/engine — aqui só
 * há banco de dados.
 */
export async function avaliarAlertas(now: Date = new Date()): Promise<number> {
  return registrarCiclo("ALERTS", async () => {
    const settings = await getSettings();

    // Um envio por canal habilitado: Telegram e e-mail têm sucesso, erro e
    // retry independentes.
    const [telegram, smtp] = await Promise.all([getTelegramConfig(), getSmtpConfig()]);
    const canais = [
      ...(telegram.enabled ? ["telegram"] : []),
      ...(smtp.enabled ? ["email"] : []),
    ];

    const [maquinasDb, jobsDb, abertosDb] = await Promise.all([
      prisma.machine.findMany({
        select: {
          id: true,
          clientId: true,
          hostname: true,
          displayName: true,
          status: true,
          lastSeen: true,
          maintenanceUntil: true,
          role: true,
          lastMountCheckAt: true,
          lastMountCheckResult: true,
          mountCheckIntervalMinutes: true,
          mountCheckToleranceMinutes: true,
          mountChecks: {
            orderBy: { receivedAt: "desc" },
            take: 1,
            select: {
              pointsFailed: true,
              points: { where: { status: "REMOUNTED" }, select: { path: true } },
            },
          },
          client: { select: { name: true } },
        },
      }),
      prisma.backupJob.findMany({
        where: { active: true, paused: false },
        select: {
          id: true,
          machineId: true,
          name: true,
          status: true,
          lastRunAt: true,
          nextExpectedAt: true,
          lastRunId: true,
          toleranceMinutes: true,
          expectedIntervalMinutes: true,
          runs: { orderBy: { receivedAt: "desc" }, take: 1, select: { errorsCount: true } },
        },
      }),
      prisma.alert.findMany({
        where: { closedAt: null },
        select: { id: true, dedupeKey: true, type: true, relatedJobIds: true, title: true },
      }),
    ]);

    // Quantas vezes cada máquina precisou de remontagem na janela. É o que
    // separa "caiu uma vez" de "cai toda noite" — e o segundo caso é problema
    // de infraestrutura, não da máquina do cliente.
    const desde = new Date(now.getTime() - JANELA_REMONTAGENS_DIAS * 24 * 60 * 60_000);
    const remontagens = await prisma.mountCheck.groupBy({
      by: ["machineId"],
      where: { result: "RECOVERED", receivedAt: { gte: desde } },
      _count: { _all: true },
    });
    const remontagensPorMaquina = new Map(
      remontagens.map((r) => [r.machineId, r._count._all]),
    );

    const maquinas: MaquinaSnapshot[] = maquinasDb.map((m) => ({
      id: m.id,
      clientId: m.clientId,
      clientName: m.client?.name ?? null,
      suporte: m.role === "SUPORTE",
      // Só monta o retrato quando a máquina de fato reporta verificação —
      // máquina sem script não pode gerar alerta de montagem.
      montagem:
        m.lastMountCheckAt === null
          ? null
          : {
              ultimaEm: m.lastMountCheckAt,
              resultado: m.lastMountCheckResult,
              pontosComFalha: m.mountChecks[0]?.pointsFailed ?? 0,
              pontosRemontados: m.mountChecks[0]?.points.map((p) => p.path) ?? [],
              remontagensRecentes: remontagensPorMaquina.get(m.id) ?? 0,
              intervaloMinutos: m.mountCheckIntervalMinutes,
              toleranciaMinutos: m.mountCheckToleranceMinutes,
            },
      hostname: m.hostname,
      displayName: m.displayName,
      status: m.status,
      lastSeen: m.lastSeen,
      maintenanceUntil: m.maintenanceUntil,
    }));

    const jobs: JobSnapshot[] = jobsDb.map((j) => {
      const deadlineMs =
        (j.lastRunAt?.getTime() ?? now.getTime()) +
        (j.expectedIntervalMinutes + j.toleranceMinutes) * 60_000;
      return {
        id: j.id,
        machineId: j.machineId,
        name: j.name,
        status: j.status,
        lastRunAt: j.lastRunAt,
        nextExpectedAt: j.nextExpectedAt,
        lateByMinutes: Math.max(0, Math.floor((now.getTime() - deadlineMs) / 60_000)),
        errorsCount: j.runs[0]?.errorsCount ?? 0,
        lastRunId: j.lastRunId,
      };
    });

    const condicoes = derivarCondicoes({
      maquinas,
      jobs,
      now,
      offlineAlertMinutes: settings.machineOfflineAlertMinutes,
      alertOnWarning: settings.alertOnWarning,
    });

    const plano = planejarAlertas(condicoes, abertosDb);
    let acoes = 0;

    for (const condicao of plano.abrir) {
      try {
        const alerta = await prisma.alert.create({
          data: {
            type: condicao.type,
            severity: condicao.severity,
            dedupeKey: condicao.dedupeKey,
            title: condicao.title,
            message: condicao.message,
            clientId: condicao.clientId,
            machineId: condicao.machineId,
            backupJobId: condicao.backupJobId,
            backupRunId: condicao.backupRunId,
            relatedJobIds: condicao.relatedJobIds,
            context: condicao.context as Prisma.InputJsonValue,
            openedAt: now,
          },
          select: { id: true },
        });

        if (canais.length > 0) {
          await prisma.alertNotification.createMany({
            data: canais.map((channel) => ({ alertId: alerta.id, kind: "OPEN" as const, channel })),
          });
        }
        acoes += 1;
      } catch (e) {
        // Índice único parcial: outro ciclo abriu o mesmo incidente primeiro.
        // Isso é exatamente o que o índice existe para impedir — não é erro.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }

    // Alerta que continua valendo: atualiza o texto (ex.: "offline há 5h" → "há 9h")
    // sem notificar de novo.
    for (const { alerta, condicao } of plano.manter) {
      await prisma.alert.update({
        where: { id: alerta.id },
        data: {
          message: condicao.message,
          severity: condicao.severity,
          relatedJobIds: condicao.relatedJobIds,
          context: condicao.context as Prisma.InputJsonValue,
        },
      });
    }

    for (const alerta of plano.fechar) {
      const registro = abertosDb.find((a) => a.id === alerta.id);
      await prisma.alert.update({ where: { id: alerta.id }, data: { closedAt: now } });
      if (canais.length > 0) {
        await prisma.alertNotification.createMany({
          data: canais.map((channel) => ({ alertId: alerta.id, kind: "RECOVERY" as const, channel })),
        });
      }
      acoes += 1;
    }

    return acoes;
  });
}
