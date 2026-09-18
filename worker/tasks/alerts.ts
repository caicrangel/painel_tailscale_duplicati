import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/config/settings";
import {
  derivarCondicoes,
  mensagemDeRecuperacao,
  planejarAlertas,
  type JobSnapshot,
  type MaquinaSnapshot,
} from "@/lib/alerts/engine";
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

    const maquinas: MaquinaSnapshot[] = maquinasDb.map((m) => ({
      id: m.id,
      clientId: m.clientId,
      clientName: m.client?.name ?? null,
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

        await prisma.alertNotification.create({
          data: { alertId: alerta.id, kind: "OPEN", channel: "telegram" },
        });
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
      await prisma.alertNotification.create({
        data: {
          alertId: alerta.id,
          kind: "RECOVERY",
          channel: "telegram",
        },
      });
      void mensagemDeRecuperacao(alerta, registro?.title ?? "incidente");
      acoes += 1;
    }

    return acoes;
  });
}
