import { env } from "@/lib/config/env";

/**
 * Envio para o Telegram. Canal best-effort: a UI é a fonte da verdade
 * (regra 6 do CLAUDE.md). Falha aqui vira retry na fila, nunca perda de alerta.
 */

const TIMEOUT_MS = 10_000;

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/** Escapa o que o parse_mode HTML do Telegram trataria como marcação. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function enviarTelegram(params: {
  texto: string;
  chatId?: string | null;
}): Promise<ResultadoEnvio> {
  const e = env();

  if (!e.TELEGRAM_ENABLED) {
    return { ok: false, erro: "Telegram desabilitado (TELEGRAM_ENABLED=false)." };
  }

  const token = e.TELEGRAM_BOT_TOKEN;
  const chat = params.chatId ?? e.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return { ok: false, erro: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: params.texto,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return { ok: false, erro: `HTTP ${resposta.status}: ${corpo.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  } finally {
    clearTimeout(timer);
  }
}

const EMOJI = {
  CRITICAL: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
} as const;

/** Formata o alerta para o Telegram. Puro — testável sem rede. */
export function formatarMensagemAlerta(params: {
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  clientName?: string | null;
  url?: string | null;
}): string {
  const linhas = [
    `${EMOJI[params.severity]} <b>${escaparHtml(params.title)}</b>`,
    "",
    escaparHtml(params.message),
  ];

  if (params.clientName) linhas.push("", `Cliente: <b>${escaparHtml(params.clientName)}</b>`);
  if (params.url) linhas.push(`${escaparHtml(params.url)}`);

  return linhas.join("\n");
}
