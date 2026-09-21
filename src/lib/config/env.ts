import { z } from "zod";

/** Regra 4 do CLAUDE.md: segredo só por env, e toda env é validada. */

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const intish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  TZ: z.string().default("America/Sao_Paulo"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),

  AUTH_SECRET: z.string().optional(),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  AUTH_COOKIE_SECURE: boolish,

  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),

  TAILSCALE_OAUTH_CLIENT_ID: z.string().optional(),
  TAILSCALE_OAUTH_CLIENT_SECRET: z.string().optional(),
  TAILSCALE_TAILNET: z.string().default("-"),
  MAGICDNS_DOMAIN: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_ENABLED: boolish,

  MACHINE_ONLINE_MAX_MINUTES: intish(5),
  MACHINE_IDLE_MAX_MINUTES: intish(60),
  MACHINE_OFFLINE_ALERT_MINUTES: intish(60),
  DEFAULT_JOB_INTERVAL_MINUTES: intish(1440),
  DEFAULT_JOB_TOLERANCE_MINUTES: intish(360),
  ALERT_ON_WARNING: boolish,

  INGEST_RATE_LIMIT_PER_MINUTE: intish(60),
  LOGIN_RATE_LIMIT_ATTEMPTS: intish(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: intish(15),

  CRON_TAILSCALE_SYNC: z.string().default("*/2 * * * *"),
  CRON_LATE_CHECK: z.string().default("*/5 * * * *"),
  CRON_ALERTS: z.string().default("* * * * *"),
  CRON_NOTIFY: z.string().default("* * * * *"),
  RAW_PAYLOAD_RETENTION_DAYS: intish(0),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${detalhes}`);
  }
  cached = parsed.data;
  return cached;
}

/** Só para testes. */
export function resetEnvCache() {
  cached = null;
}
