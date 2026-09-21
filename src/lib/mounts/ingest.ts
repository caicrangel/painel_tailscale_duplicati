import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { maquinaCasa, normalizarHostname } from "@/lib/duplicati/match";
import type { RelatorioMontagens } from "./payload";

/**
 * Grava um relatório de verificação de montagens.
 *
 * A máquina é resolvida pelo hostname dentro do cliente do token — mesmos
 * apelidos que a ingestão do Duplicati usa, para o script e o Duplicati
 * caírem na mesma máquina mesmo quando o Tailscale a chama por outro nome.
 */
export type ResultadoIngestaoMontagens = {
  mountCheckId: string;
  machineId: string;
  maquinaCriada: boolean;
};

async function resolverMaquina(
  clientId: string,
  host: string | null,
): Promise<{ machineId: string; criada: boolean }> {
  const candidatas = await prisma.machine.findMany({
    where: { clientId },
    select: { id: true, hostname: true, displayName: true, duplicatiHostnames: true },
  });

  const casada = candidatas.find((m) => maquinaCasa(m, host));
  if (casada) return { machineId: casada.id, criada: false };

  const hostname = normalizarHostname(host) ?? "maquina-nao-identificada";

  const existente = await prisma.machine.findFirst({
    where: { clientId, hostname, source: "DUPLICATI" },
    select: { id: true },
  });
  if (existente) return { machineId: existente.id, criada: false };

  const nova = await prisma.machine.create({
    data: { clientId, source: "DUPLICATI", hostname, displayName: host, status: "UNKNOWN" },
    select: { id: true },
  });
  return { machineId: nova.id, criada: true };
}

export async function registrarVerificacaoMontagens(params: {
  clientId: string;
  relatorio: RelatorioMontagens;
  rawPayload: Prisma.InputJsonValue;
  parseError: string | null;
  now?: Date;
}): Promise<ResultadoIngestaoMontagens> {
  const { clientId, relatorio, rawPayload, parseError } = params;
  const now = params.now ?? new Date();

  const { machineId, criada } = await resolverMaquina(clientId, relatorio.host);

  const check = await prisma.mountCheck.create({
    data: {
      machineId,
      result: relatorio.result,
      pointsTotal: relatorio.pointsTotal,
      pointsFailed: relatorio.pointsFailed,
      remounted: relatorio.remounted,
      durationSeconds: relatorio.durationSeconds,
      bootAt: relatorio.bootAt,
      bootRecent: relatorio.bootRecent,
      reportedHost: relatorio.host,
      startedAt: relatorio.startedAt,
      rawPayload,
      parseError,
      receivedAt: now,
      points: {
        create: relatorio.pontos.map((p) => ({
          path: p.path,
          status: p.status,
          fsTypeExpected: p.fsTypeExpected,
          fsTypeActual: p.fsTypeActual,
          detail: p.detail,
          size: p.size,
          used: p.used,
          available: p.available,
          usePercent: p.usePercent,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.machine.update({
    where: { id: machineId },
    data: { lastMountCheckAt: now, lastMountCheckResult: relatorio.result },
  });

  return { mountCheckId: check.id, machineId, maquinaCriada: criada };
}
