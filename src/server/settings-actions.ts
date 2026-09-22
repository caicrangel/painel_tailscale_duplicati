"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { primeiroErro } from "@/lib/validation/schemas";
import {
  getResumoConfig,
  salvarExecucaoConfig,
  salvarResumoConfig,
  salvarSmtpConfig,
  salvarTelegramConfig,
} from "@/lib/config/integracoes";
import { env } from "@/lib/config/env";
import { invalidateSettingsCache, setSetting, type AppSettings } from "@/lib/config/settings";
import { enviarTelegram, formatarTeste } from "@/lib/alerts/telegram";
import { enviarEmail, escaparHtmlEmail, montarHtml } from "@/lib/alerts/email";
import { enviarResumoAgora } from "@/lib/alerts/resumo-envio";

const bool = (fd: FormData, nome: string) => fd.get(nome) === "on" || fd.get(nome) === "true";
const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/**
 * Campo de segredo: string vazia significa "não mexi", e não "apague".
 * Sem essa distinção, abrir a tela e salvar qualquer outro campo apagaria o
 * token — a UI nunca recebe o valor atual de volta para reenviar.
 */
function segredo(fd: FormData, nome: string): string | undefined {
  const v = fd.get(nome);
  if (typeof v !== "string" || v.trim() === "") return undefined;
  return v.trim();
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export async function salvarTelegram(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const chatId = texto(formData, "chatId");
  const enabled = bool(formData, "enabled");
  const token = segredo(formData, "botToken");
  const apagarToken = formData.get("apagarToken") === "true";

  await salvarTelegramConfig({
    enabled,
    chatId,
    botToken: apagarToken ? "" : token,
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.telegram_salva",
    entityType: "Setting",
    // Nunca registrar o segredo em auditoria — só o fato de ter mudado.
    metadata: { enabled, chatIdDefinido: chatId !== null, tokenAlterado: token !== undefined || apagarToken },
  });

  revalidatePath("/configuracoes/telegram");
  return { ok: true, data: undefined };
}

export async function testarTelegram(): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const r = await enviarTelegram({
    texto: formatarTeste(new Date(), env().TZ).html,
    forcar: true,
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.telegram_teste",
    metadata: { ok: r.ok },
  });

  return r.ok ? { ok: true, data: undefined } : { ok: false, error: r.erro };
}

// ─── SMTP ────────────────────────────────────────────────────────────────────

const smtpSchema = z.object({
  host: z.string().trim().min(1, "Informe o servidor SMTP.").nullable(),
  port: z.coerce.number().int().min(1).max(65535),
  from: z.string().trim().email("Remetente inválido.").nullable(),
});

export async function salvarSmtp(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const enabled = bool(formData, "enabled");
  const host = texto(formData, "host");
  const from = texto(formData, "from");

  const destinatarios = (texto(formData, "to") ?? "")
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const emailInvalido = destinatarios.find((e) => !z.string().email().safeParse(e).success);
  if (emailInvalido) return { ok: false, error: `Destinatário inválido: ${emailInvalido}` };

  // Só exige host/remetente quando o canal está sendo ligado.
  if (enabled) {
    const parsed = smtpSchema.safeParse({ host, port: formData.get("port"), from });
    if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };
    if (destinatarios.length === 0) {
      return { ok: false, error: "Informe ao menos um destinatário." };
    }
  }

  await salvarSmtpConfig({
    enabled,
    host,
    port: Number(formData.get("port") ?? 587) || 587,
    secure: bool(formData, "secure"),
    user: texto(formData, "user"),
    from,
    to: destinatarios,
    password: formData.get("apagarSenha") === "true" ? "" : segredo(formData, "password"),
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.smtp_salva",
    entityType: "Setting",
    metadata: { enabled, host, destinatarios: destinatarios.length },
  });

  revalidatePath("/configuracoes/email");
  return { ok: true, data: undefined };
}

export async function testarSmtp(): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const teste = formatarTeste(new Date(), env().TZ);
  const r = await enviarEmail({
    assunto: teste.titulo,
    texto: teste.texto,
    html: montarHtml(teste.titulo, escaparHtmlEmail(teste.texto), true),
    forcar: true,
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.smtp_teste",
    metadata: { ok: r.ok },
  });

  return r.ok ? { ok: true, data: undefined } : { ok: false, error: r.erro };
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

export async function salvarResumo(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const horario = texto(formData, "horario") ?? "08:00";
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(horario)) {
    return { ok: false, error: "Horário inválido. Use o formato HH:MM." };
  }

  await salvarResumoConfig({
    enabled: bool(formData, "enabled"),
    horario,
    porTelegram: bool(formData, "porTelegram"),
    porEmail: bool(formData, "porEmail"),
    incluirSucessos: bool(formData, "incluirSucessos"),
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.resumo_salvo",
    entityType: "Setting",
    metadata: { horario },
  });

  revalidatePath("/configuracoes/telegram");
  return { ok: true, data: undefined };
}

export async function enviarResumoTeste(): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const config = await getResumoConfig();
  if (!config.porTelegram && !config.porEmail) {
    return { ok: false, error: "Escolha ao menos um canal antes de enviar." };
  }

  const r = await enviarResumoAgora();
  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.resumo_enviado_manual",
    metadata: { ok: r.ok },
  });

  return r.ok ? { ok: true, data: undefined } : { ok: false, error: r.erro ?? "Falha no envio." };
}

// ─── Recibo de execução ──────────────────────────────────────────────────────

export async function salvarExecucao(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const escopo = String(formData.get("escopo") ?? "TODAS");
  if (!["TODAS", "SOMENTE_SUCESSO", "SOMENTE_FALHAS"].includes(escopo)) {
    return { ok: false, error: "Escopo inválido." };
  }

  const enabled = bool(formData, "enabled");
  const porTelegram = bool(formData, "porTelegram");
  const porEmail = bool(formData, "porEmail");

  if (enabled && !porTelegram && !porEmail) {
    return { ok: false, error: "Escolha ao menos um canal para receber os avisos." };
  }

  await salvarExecucaoConfig({
    enabled,
    escopo: escopo as "TODAS" | "SOMENTE_SUCESSO" | "SOMENTE_FALHAS",
    porTelegram,
    porEmail,
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.execucao_salva",
    entityType: "Setting",
    metadata: { enabled, escopo, porTelegram, porEmail },
  });

  revalidatePath("/configuracoes/telegram");
  return { ok: true, data: undefined };
}

// ─── Monitoramento (limiares) ────────────────────────────────────────────────

const limiaresSchema = z.object({
  machineOnlineMaxMinutes: z.coerce.number().int().min(1).max(1440),
  machineIdleMaxMinutes: z.coerce.number().int().min(2).max(10080),
  machineOfflineAlertMinutes: z.coerce.number().int().min(1).max(10080),
  defaultJobIntervalMinutes: z.coerce.number().int().min(5).max(129600),
  defaultJobToleranceMinutes: z.coerce.number().int().min(0).max(43200),
  rawPayloadRetentionDays: z.coerce.number().int().min(0).max(3650),
});

export async function salvarLimiares(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const parsed = limiaresSchema.safeParse({
    machineOnlineMaxMinutes: formData.get("machineOnlineMaxMinutes"),
    machineIdleMaxMinutes: formData.get("machineIdleMaxMinutes"),
    machineOfflineAlertMinutes: formData.get("machineOfflineAlertMinutes"),
    defaultJobIntervalMinutes: formData.get("defaultJobIntervalMinutes"),
    defaultJobToleranceMinutes: formData.get("defaultJobToleranceMinutes"),
    rawPayloadRetentionDays: formData.get("rawPayloadRetentionDays"),
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  if (parsed.data.machineIdleMaxMinutes <= parsed.data.machineOnlineMaxMinutes) {
    return {
      ok: false,
      error: "O limite de ociosa precisa ser maior que o de online.",
    };
  }

  const alertOnWarning = bool(formData, "alertOnWarning");

  const valores: Partial<AppSettings> = { ...parsed.data, alertOnWarning };
  for (const [chave, valor] of Object.entries(valores)) {
    await setSetting(chave as keyof AppSettings, valor as never);
  }
  invalidateSettingsCache();

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "configuracao.limiares_salvos",
    entityType: "Setting",
    metadata: valores as Record<string, unknown>,
  });

  revalidatePath("/configuracoes/monitoramento");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** Diagnóstico do sistema, para a aba "Sistema". */
export async function ultimosCiclos() {
  return prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    distinct: ["kind"],
    select: { kind: true, startedAt: true, finishedAt: true, ok: true, error: true, itemsProcessed: true },
  });
}
