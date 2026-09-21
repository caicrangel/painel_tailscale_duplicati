import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { env } from "./env";
import { cifrar, decifrar, ehSegredoCifrado, type SegredoCifrado } from "./secrets";

/**
 * Configurações das integrações (Telegram, SMTP, resumo periódico).
 *
 * Precedência: o que está no banco vence; o que não está cai para a env.
 * Assim quem já configurou pelo .env continua funcionando sem tocar em nada, e
 * quem preferir a interface não precisa mexer em arquivo nem reiniciar container.
 *
 * Segredos são guardados cifrados (ver secrets.ts) e nunca saem daqui em texto
 * claro para o navegador — a UI recebe apenas `configurado: true/false`.
 */

const CHAVE_TELEGRAM = "integracao.telegram";
const CHAVE_SMTP = "integracao.smtp";
const CHAVE_RESUMO = "integracao.resumo";

// ─── Telegram ────────────────────────────────────────────────────────────────

export type TelegramConfig = {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  /** De onde veio o token em uso, para a UI explicar o que está valendo. */
  origemToken: "banco" | "env" | "nenhum";
};

const telegramArmazenado = z.object({
  enabled: z.boolean().default(false),
  chatId: z.string().nullable().default(null),
  botToken: z.unknown().optional(),
});

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const e = env();
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_TELEGRAM } });
  const parsed = telegramArmazenado.safeParse(linha?.value ?? {});
  const guardado = parsed.success ? parsed.data : { enabled: false, chatId: null, botToken: undefined };

  const tokenDoBanco = ehSegredoCifrado(guardado.botToken) ? decifrar(guardado.botToken) : null;
  const tokenDaEnv = e.TELEGRAM_BOT_TOKEN?.trim() || null;

  const botToken = tokenDoBanco ?? tokenDaEnv;

  return {
    // Sem linha no banco, o switch é o da env (compatibilidade com quem já usava).
    enabled: linha ? guardado.enabled : e.TELEGRAM_ENABLED,
    botToken,
    chatId: guardado.chatId ?? (e.TELEGRAM_CHAT_ID?.trim() || null),
    origemToken: tokenDoBanco ? "banco" : tokenDaEnv ? "env" : "nenhum",
  };
}

export async function salvarTelegramConfig(input: {
  enabled: boolean;
  chatId: string | null;
  /** undefined = manter o token atual; string vazia = apagar. */
  botToken?: string;
}): Promise<void> {
  const atual = await prisma.setting.findUnique({ where: { key: CHAVE_TELEGRAM } });
  const parsed = telegramArmazenado.safeParse(atual?.value ?? {});
  const anterior = parsed.success ? parsed.data.botToken : undefined;

  let botToken: SegredoCifrado | null | undefined;
  if (input.botToken === undefined) botToken = ehSegredoCifrado(anterior) ? anterior : undefined;
  else if (input.botToken.trim() === "") botToken = null;
  else botToken = cifrar(input.botToken.trim());

  await prisma.setting.upsert({
    where: { key: CHAVE_TELEGRAM },
    create: { key: CHAVE_TELEGRAM, value: { enabled: input.enabled, chatId: input.chatId, botToken } as never },
    update: { value: { enabled: input.enabled, chatId: input.chatId, botToken } as never },
  });
}

// ─── SMTP ────────────────────────────────────────────────────────────────────

export type SmtpConfig = {
  enabled: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string | null;
  to: string[];
  senhaConfigurada: boolean;
};

const smtpArmazenado = z.object({
  enabled: z.boolean().default(false),
  host: z.string().nullable().default(null),
  port: z.number().int().positive().default(587),
  secure: z.boolean().default(false),
  user: z.string().nullable().default(null),
  from: z.string().nullable().default(null),
  to: z.array(z.string()).default([]),
  password: z.unknown().optional(),
});

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_SMTP } });
  const parsed = smtpArmazenado.safeParse(linha?.value ?? {});
  const g = parsed.success
    ? parsed.data
    : { enabled: false, host: null, port: 587, secure: false, user: null, from: null, to: [], password: undefined };

  const password = ehSegredoCifrado(g.password) ? decifrar(g.password) : null;

  return {
    enabled: g.enabled,
    host: g.host,
    port: g.port,
    secure: g.secure,
    user: g.user,
    password,
    from: g.from,
    to: g.to,
    senhaConfigurada: password !== null,
  };
}

export async function salvarSmtpConfig(input: {
  enabled: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  from: string | null;
  to: string[];
  password?: string;
}): Promise<void> {
  const atual = await prisma.setting.findUnique({ where: { key: CHAVE_SMTP } });
  const parsed = smtpArmazenado.safeParse(atual?.value ?? {});
  const anterior = parsed.success ? parsed.data.password : undefined;

  let password: SegredoCifrado | null | undefined;
  if (input.password === undefined) password = ehSegredoCifrado(anterior) ? anterior : undefined;
  else if (input.password.trim() === "") password = null;
  else password = cifrar(input.password);

  const valor = {
    enabled: input.enabled,
    host: input.host,
    port: input.port,
    secure: input.secure,
    user: input.user,
    from: input.from,
    to: input.to,
    password,
  };

  await prisma.setting.upsert({
    where: { key: CHAVE_SMTP },
    create: { key: CHAVE_SMTP, value: valor as never },
    update: { value: valor as never },
  });
}

// ─── Resumo periódico ────────────────────────────────────────────────────────

export type ResumoConfig = {
  enabled: boolean;
  /** "HH:MM" no fuso da aplicação. */
  horario: string;
  porTelegram: boolean;
  porEmail: boolean;
  /** Incluir também os jobs que rodaram bem, não só os problemas. */
  incluirSucessos: boolean;
};

const resumoArmazenado = z.object({
  enabled: z.boolean().default(false),
  horario: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default("08:00"),
  porTelegram: z.boolean().default(true),
  porEmail: z.boolean().default(false),
  incluirSucessos: z.boolean().default(true),
});

export async function getResumoConfig(): Promise<ResumoConfig> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_RESUMO } });
  const parsed = resumoArmazenado.safeParse(linha?.value ?? {});
  return parsed.success ? parsed.data : resumoArmazenado.parse({});
}

export async function salvarResumoConfig(input: ResumoConfig): Promise<void> {
  const valor = resumoArmazenado.parse(input);
  await prisma.setting.upsert({
    where: { key: CHAVE_RESUMO },
    create: { key: CHAVE_RESUMO, value: valor as never },
    update: { value: valor as never },
  });
}
