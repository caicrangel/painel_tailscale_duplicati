import { prisma } from "@/lib/db/prisma";
import { env } from "./env";
import { z } from "zod";

/**
 * Limiares operacionais. Default vem da env; a tabela `settings` sobrescreve
 * sem redeploy. Cache curto em memória — o worker roda a cada minuto, não
 * precisa ir ao banco a cada avaliação.
 */
export const settingsSchema = z.object({
  machineOnlineMaxMinutes: z.number().int().positive(),
  machineIdleMaxMinutes: z.number().int().positive(),
  machineOfflineAlertMinutes: z.number().int().positive(),
  defaultJobIntervalMinutes: z.number().int().positive(),
  defaultJobToleranceMinutes: z.number().int().nonnegative(),
  alertOnWarning: z.boolean(),
  telegramEnabled: z.boolean(),
  rawPayloadRetentionDays: z.number().int().nonnegative(),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export function defaultSettings(): AppSettings {
  const e = env();
  return {
    machineOnlineMaxMinutes: e.MACHINE_ONLINE_MAX_MINUTES,
    machineIdleMaxMinutes: e.MACHINE_IDLE_MAX_MINUTES,
    machineOfflineAlertMinutes: e.MACHINE_OFFLINE_ALERT_MINUTES,
    defaultJobIntervalMinutes: e.DEFAULT_JOB_INTERVAL_MINUTES,
    defaultJobToleranceMinutes: e.DEFAULT_JOB_TOLERANCE_MINUTES,
    alertOnWarning: e.ALERT_ON_WARNING,
    telegramEnabled: e.TELEGRAM_ENABLED,
    rawPayloadRetentionDays: e.RAW_PAYLOAD_RETENTION_DAYS,
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; value: AppSettings } | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const base = defaultSettings();
  try {
    const rows = await prisma.setting.findMany();
    const overrides: Record<string, unknown> = {};
    for (const row of rows) overrides[row.key] = row.value;
    const merged = settingsSchema.safeParse({ ...base, ...overrides });
    // Override inválido no banco não pode derrubar o monitoramento.
    cache = { at: Date.now(), value: merged.success ? merged.data : base };
  } catch {
    cache = { at: Date.now(), value: base };
  }
  return cache.value;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
  invalidateSettingsCache();
}
