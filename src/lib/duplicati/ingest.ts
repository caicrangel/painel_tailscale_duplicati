import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calcularStatusJob, carenciaInicial } from "@/lib/jobs/late";
import type { RelatorioDuplicati } from "./payload";
import { chaveDoJob, maquinaCasa, normalizarHostname } from "./match";
import type { AppSettings } from "@/lib/config/settings";
import { getExecucaoConfig } from "@/lib/config/integracoes";
import { deveEnviarRecibo } from "@/lib/alerts/execucao";

/** Máquina-balde para relatórios que não trazem identificação nenhuma. */
export const HOSTNAME_NAO_IDENTIFICADO = "maquina-nao-identificada";

export type ResultadoIngestao = {
  machineId: string;
  backupJobId: string;
  backupRunId: string;
  /** True quando este relatório já tinha sido registrado antes (reenvio). */
  duplicado: boolean;
  /** True quando a máquina foi criada agora, sem vínculo com device do Tailscale. */
  maquinaCriada: boolean;
};

/**
 * Resolve a máquina do relatório, na ordem descrita no PLAN.md §3.2:
 *   1. pelo Extra.machine-id já visto antes
 *   2. por hostname, entre as máquinas do MESMO cliente do token
 *   3. cria uma máquina órfã vinculada ao cliente do token
 *
 * Nunca falha: um relatório sem identificação ainda vira dado visível.
 */
async function resolverMaquina(
  clientId: string,
  relatorio: RelatorioDuplicati,
): Promise<{ machineId: string; criada: boolean }> {
  if (relatorio.machineId) {
    const porId = await prisma.machine.findFirst({
      where: { duplicatiMachineId: relatorio.machineId },
      select: { id: true, clientId: true },
    });
    if (porId) return { machineId: porId.id, criada: false };
  }

  const hostname = normalizarHostname(relatorio.machineName);

  if (hostname) {
    // Só busca dentro do cliente do token: dois clientes podem ter um "SERVIDOR".
    const candidatas = await prisma.machine.findMany({
      where: { clientId },
      select: {
        id: true,
        hostname: true,
        displayName: true,
        duplicatiMachineId: true,
        duplicatiHostnames: true,
      },
    });

    const casada = candidatas.find((m) => maquinaCasa(m, relatorio.machineName));

    if (casada) {
      // Guarda o machine-id para os próximos relatórios caírem direto no passo 1.
      if (relatorio.machineId && casada.duplicatiMachineId !== relatorio.machineId) {
        await prisma.machine.update({
          where: { id: casada.id },
          data: { duplicatiMachineId: relatorio.machineId },
        });
      }
      return { machineId: casada.id, criada: false };
    }
  }

  // Relatório sem machine-id e sem machine-name: tudo do cliente cai numa única
  // máquina-balde. Sem isto, cada payload não identificado criaria uma máquina
  // nova e a tela de Máquinas viraria lixo.
  const hostnameFinal = hostname ?? HOSTNAME_NAO_IDENTIFICADO;

  const existente = await prisma.machine.findFirst({
    where: { clientId, hostname: hostnameFinal, source: "DUPLICATI" },
    select: { id: true },
  });
  if (existente) {
    if (relatorio.machineId) {
      await prisma.machine.update({
        where: { id: existente.id },
        data: { duplicatiMachineId: relatorio.machineId },
      });
    }
    return { machineId: existente.id, criada: false };
  }

  const nova = await prisma.machine.create({
    data: {
      clientId,
      source: "DUPLICATI",
      hostname: hostnameFinal,
      displayName: relatorio.machineName,
      duplicatiMachineId: relatorio.machineId,
      status: "UNKNOWN",
    },
    select: { id: true },
  });

  return { machineId: nova.id, criada: true };
}

/**
 * Grava o relatório: upsert do job + insert da execução + recálculo dos campos
 * denormalizados que o dashboard lê.
 */
export async function registrarRelatorio(params: {
  clientId: string;
  relatorio: RelatorioDuplicati;
  rawPayload: Prisma.InputJsonValue;
  rawContentType: string | null;
  parseError: string | null;
  settings: AppSettings;
  now?: Date;
}): Promise<ResultadoIngestao> {
  const { clientId, relatorio, rawPayload, rawContentType, parseError, settings } = params;
  const now = params.now ?? new Date();

  const { machineId, criada } = await resolverMaquina(clientId, relatorio);
  const duplicatiBackupId = chaveDoJob(relatorio.backupId, relatorio.backupName);

  const job = await prisma.backupJob.upsert({
    where: { machineId_duplicatiBackupId: { machineId, duplicatiBackupId } },
    create: {
      machineId,
      duplicatiBackupId,
      name: relatorio.backupName ?? duplicatiBackupId,
      expectedIntervalMinutes: settings.defaultJobIntervalMinutes,
      toleranceMinutes: settings.defaultJobToleranceMinutes,
      // Job recém-descoberto não vira "atrasado" antes de ter chance de rodar.
      graceUntil: carenciaInicial(settings.defaultJobIntervalMinutes, now),
    },
    update: {
      // O nome pode mudar no Duplicati; o resto da configuração é nossa e não
      // é sobrescrita por relatório nenhum.
      name: relatorio.backupName ?? undefined,
    },
  });

  const dadosRun = {
    backupJobId: job.id,
    parsedResult: relatorio.parsedResult,
    beginTime: relatorio.beginTime,
    endTime: relatorio.endTime,
    durationSeconds: relatorio.durationSeconds,
    sizeOfExaminedFiles: relatorio.sizeOfExaminedFiles,
    examinedFiles: relatorio.examinedFiles,
    addedFiles: relatorio.addedFiles,
    deletedFiles: relatorio.deletedFiles,
    modifiedFiles: relatorio.modifiedFiles,
    bytesUploaded: relatorio.bytesUploaded,
    bytesDownloaded: relatorio.bytesDownloaded,
    knownFileSize: relatorio.knownFileSize,
    warningsCount: relatorio.warningsCount,
    errorsCount: relatorio.errorsCount,
    messagesCount: relatorio.messagesCount,
    mainOperation: relatorio.mainOperation,
    duplicatiVersion: relatorio.duplicatiVersion,
    rawPayload,
    rawContentType,
    parseError,
    receivedAt: now,
  };

  let runId: string;
  let duplicado = false;

  try {
    const run = await prisma.backupRun.create({ data: dadosRun, select: { id: true } });
    runId = run.id;
  } catch (e) {
    // Unique (job, beginTime, endTime): reenvio do mesmo relatório.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existente = await prisma.backupRun.findFirst({
        where: { backupJobId: job.id, beginTime: relatorio.beginTime, endTime: relatorio.endTime },
        select: { id: true },
      });
      if (!existente) throw e;
      runId = existente.id;
      duplicado = true;
    } else {
      throw e;
    }
  }

  if (!duplicado) {
    // A âncora do atraso é o nosso relógio (receivedAt), não o da máquina do
    // cliente — relógio errado no cliente não pode bagunçar o dead man's switch.
    const lastRunAt = now;
    const avaliacao = calcularStatusJob({
      lastRunAt,
      lastParsedResult: relatorio.parsedResult,
      expectedIntervalMinutes: job.expectedIntervalMinutes,
      toleranceMinutes: job.toleranceMinutes,
      graceUntil: null, // já executou: a carência perdeu a função
      paused: job.paused,
      active: job.active,
      createdAt: job.createdAt,
      now,
    });

    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        lastRunAt,
        lastParsedResult: relatorio.parsedResult,
        lastRunId: runId,
        nextExpectedAt: avaliacao.nextExpectedAt,
        status: avaliacao.status,
        graceUntil: null,
      },
    });
  }

  // Recibo de execução: enfileira aqui, envia no worker. A resposta ao
  // Duplicati não pode esperar o Telegram — o contrato desta rota é responder
  // rápido, e um canal lento não pode virar timeout do lado do cliente.
  if (!duplicado) {
    await enfileirarRecibo(runId, relatorio.parsedResult);
  }

  return {
    machineId,
    backupJobId: job.id,
    backupRunId: runId,
    duplicado,
    maquinaCriada: criada,
  };
}

/** Cria um recibo pendente por canal habilitado, se a configuração pedir. */
async function enfileirarRecibo(
  backupRunId: string,
  parsedResult: RelatorioDuplicati["parsedResult"],
): Promise<void> {
  try {
    const config = await getExecucaoConfig();
    if (!config.enabled) return;
    if (!deveEnviarRecibo(parsedResult, config.escopo)) return;

    const canais = [
      ...(config.porTelegram ? ["telegram"] : []),
      ...(config.porEmail ? ["email"] : []),
    ];
    if (canais.length === 0) return;

    await prisma.runNotification.createMany({
      data: canais.map((channel) => ({ backupRunId, channel })),
      skipDuplicates: true,
    });
  } catch (erro) {
    // Falha ao enfileirar o aviso não pode derrubar a ingestão: o relatório já
    // está gravado, e é ele que sustenta o monitoramento.
    console.error("[ingest] não foi possível enfileirar o recibo de execução", erro);
  }
}
