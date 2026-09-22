import type { JobStatus, MachineStatus, ParsedResult, AlertSeverity, AlertType } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";

/** Vocabulário único de status: rótulo em pt-BR + tom de cor, usado em toda a UI. */

export const MACHINE_STATUS: Record<MachineStatus, { label: string; tone: Tone }> = {
  ONLINE: { label: "Online", tone: "ok" },
  IDLE: { label: "Ociosa", tone: "idle" },
  OFFLINE: { label: "Offline", tone: "danger" },
  UNKNOWN: { label: "Desconhecido", tone: "neutral" },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  OK: { label: "OK", tone: "ok" },
  WARNING: { label: "Warning", tone: "warn" },
  ERROR: { label: "Erro", tone: "danger" },
  LATE: { label: "Atrasado", tone: "late" },
  PAUSED: { label: "Pausado", tone: "neutral" },
  UNKNOWN: { label: "Sem dados", tone: "neutral" },
};

export const PARSED_RESULT: Record<ParsedResult, { label: string; tone: Tone }> = {
  SUCCESS: { label: "Sucesso", tone: "ok" },
  WARNING: { label: "Warning", tone: "warn" },
  ERROR: { label: "Erro", tone: "danger" },
  FATAL: { label: "Fatal", tone: "danger" },
  UNKNOWN: { label: "Desconhecido", tone: "neutral" },
};

export const ALERT_SEVERITY: Record<AlertSeverity, { label: string; tone: Tone }> = {
  INFO: { label: "Info", tone: "info" },
  WARNING: { label: "Atenção", tone: "warn" },
  CRITICAL: { label: "Crítico", tone: "danger" },
};

export const ALERT_TYPE: Record<AlertType, { label: string; tone: Tone }> = {
  BACKUP_FAILED: { label: "Backup com erro", tone: "danger" },
  BACKUP_WARNING: { label: "Backup com warning", tone: "warn" },
  BACKUP_LATE: { label: "Backup atrasado", tone: "late" },
  MACHINE_OFFLINE: { label: "Máquina offline", tone: "danger" },
  MOUNT_FAILED: { label: "Montagem com falha", tone: "danger" },
  MOUNT_REMOUNTED: { label: "Ponto remontado", tone: "warn" },
  MOUNT_LATE: { label: "Verificação de montagem parada", tone: "warn" },
};

export const MOUNT_RESULT: Record<
  "OK" | "RECOVERED" | "FAILED" | "UNKNOWN",
  { label: string; tone: Tone }
> = {
  OK: { label: "Tudo montado", tone: "ok" },
  RECOVERED: { label: "Recuperado", tone: "warn" },
  FAILED: { label: "Falha", tone: "danger" },
  UNKNOWN: { label: "Sem veredito", tone: "neutral" },
};

export const MOUNT_POINT_STATUS: Record<
  "OK" | "REMOUNTED" | "FAILED" | "UNKNOWN",
  { label: string; tone: Tone }
> = {
  OK: { label: "estável", tone: "ok" },
  REMOUNTED: { label: "remontado", tone: "warn" },
  FAILED: { label: "falhou", tone: "danger" },
  UNKNOWN: { label: "desconhecido", tone: "neutral" },
};

/** Ordem de prioridade para a lista de problemas do dashboard. */
export const PRIORIDADE_SEVERIDADE: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};
