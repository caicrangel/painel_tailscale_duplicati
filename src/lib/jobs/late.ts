import type { JobStatus, MachineStatus, ParsedResult } from "@prisma/client";

/**
 * Dead man's switch — o coração do sistema.
 *
 * Um job que falha é visível; um job que simplesmente NÃO roda é invisível.
 * Aqui decidimos se ele deveria ter rodado:
 *
 *   nextExpectedAt = âncora + expectedIntervalMinutes
 *   deadline       = nextExpectedAt + toleranceMinutes
 *   atrasado       = now > deadline
 *
 * A âncora é a última execução reportada; um job que nunca reportou usa a data
 * de criação, para não ficar invisível para sempre à espera do primeiro relatório.
 *
 * Função pura: não conhece Prisma nem rede (regra 5 do CLAUDE.md).
 */

export type AvaliacaoJobInput = {
  lastRunAt: Date | null;
  lastParsedResult: ParsedResult | null;
  expectedIntervalMinutes: number;
  toleranceMinutes: number;
  graceUntil: Date | null;
  paused: boolean;
  active: boolean;
  createdAt: Date;
  now: Date;
};

export type AvaliacaoJob = {
  status: JobStatus;
  /** Quando a próxima execução é esperada (sem a tolerância). */
  nextExpectedAt: Date | null;
  /** Quando o job passa a ser considerado atrasado (com a tolerância). */
  deadline: Date | null;
  isLate: boolean;
  /** Minutos de atraso além do deadline; 0 quando não está atrasado. */
  lateByMinutes: number;
  /** True quando o veredito se baseia na criação do job, não numa execução real. */
  nuncaExecutou: boolean;
};

const MIN = 60_000;

function statusDoResultado(resultado: ParsedResult | null): JobStatus {
  switch (resultado) {
    case "SUCCESS":
      return "OK";
    case "WARNING":
      return "WARNING";
    case "ERROR":
    case "FATAL":
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

export function calcularStatusJob(input: AvaliacaoJobInput): AvaliacaoJob {
  const {
    lastRunAt,
    lastParsedResult,
    expectedIntervalMinutes,
    toleranceMinutes,
    graceUntil,
    paused,
    active,
    createdAt,
    now,
  } = input;

  const nuncaExecutou = lastRunAt === null;
  const ancora = lastRunAt ?? createdAt;
  const nextExpectedAt = new Date(ancora.getTime() + expectedIntervalMinutes * MIN);
  const deadline = new Date(nextExpectedAt.getTime() + toleranceMinutes * MIN);

  // Job pausado ou inativo não é avaliado — nem atrasa, nem alerta.
  if (paused || !active) {
    return {
      status: "PAUSED",
      nextExpectedAt,
      deadline,
      isLate: false,
      lateByMinutes: 0,
      nuncaExecutou,
    };
  }

  // Carência: recém-cadastrado não vira problema antes de ter chance de rodar.
  const emCarencia = graceUntil !== null && now.getTime() < graceUntil.getTime();
  const atrasado = !emCarencia && now.getTime() > deadline.getTime();

  if (atrasado) {
    return {
      status: "LATE",
      nextExpectedAt,
      deadline,
      isLate: true,
      lateByMinutes: Math.floor((now.getTime() - deadline.getTime()) / MIN),
      nuncaExecutou,
    };
  }

  return {
    status: statusDoResultado(lastParsedResult),
    nextExpectedAt,
    deadline,
    isLate: false,
    lateByMinutes: 0,
    nuncaExecutou,
  };
}

/**
 * Deriva o status de uma máquina a partir do último contato com o Tailscale.
 * Limiares configuráveis (Setting/env) — o default é 5 e 60 minutos.
 */
export function derivarStatusMaquina(params: {
  lastSeen: Date | null;
  now: Date;
  onlineMaxMinutes: number;
  idleMaxMinutes: number;
}): MachineStatus {
  const { lastSeen, now, onlineMaxMinutes, idleMaxMinutes } = params;
  if (!lastSeen) return "UNKNOWN";

  const minutos = (now.getTime() - lastSeen.getTime()) / MIN;
  // lastSeen no futuro (relógio adiantado do device) conta como online.
  if (minutos < onlineMaxMinutes) return "ONLINE";
  if (minutos < idleMaxMinutes) return "IDLE";
  return "OFFLINE";
}

/** Há quantos minutos a máquina está sem contato. */
export function minutosOffline(lastSeen: Date | null, now: Date): number | null {
  if (!lastSeen) return null;
  return Math.max(0, Math.floor((now.getTime() - lastSeen.getTime()) / MIN));
}

/** Carência padrão de um job novo: um intervalo inteiro a partir de agora. */
export function carenciaInicial(expectedIntervalMinutes: number, now: Date): Date {
  return new Date(now.getTime() + expectedIntervalMinutes * MIN);
}
