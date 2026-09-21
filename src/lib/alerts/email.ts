import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/config/integracoes";
import type { ResultadoEnvio } from "./telegram";

/**
 * Envio por e-mail (SMTP). Mesmo princípio do Telegram: canal best-effort.
 * Falha aqui vira retry na fila, nunca perda de incidente — a UI é a fonte
 * da verdade (regra 6 do CLAUDE.md).
 */

const TIMEOUT_MS = 15_000;

export function escaparHtmlEmail(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function enviarEmail(params: {
  assunto: string;
  html: string;
  texto: string;
  para?: string[];
  forcar?: boolean;
}): Promise<ResultadoEnvio> {
  const config = await getSmtpConfig();

  if (!config.enabled && !params.forcar) {
    return { ok: false, erro: "E-mail desabilitado nas configurações." };
  }
  if (!config.host) return { ok: false, erro: "Servidor SMTP não configurado." };

  const destinatarios = params.para?.length ? params.para : config.to;
  if (destinatarios.length === 0) {
    return { ok: false, erro: "Nenhum destinatário configurado." };
  }

  try {
    const transporte = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });

    await transporte.sendMail({
      from: config.from ?? config.user ?? "painel@localhost",
      to: destinatarios.join(", "),
      subject: params.assunto,
      text: params.texto,
      html: params.html,
    });

    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** Envelopa um texto simples num HTML legível, sem depender de imagens externas. */
export function montarHtml(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f6f8fa;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #d8dee4;border-radius:12px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid #d8dee4">
      <strong style="font-size:15px;color:#1f2328">${escaparHtmlEmail(titulo)}</strong>
    </div>
    <div style="padding:20px;color:#1f2328;font-size:14px;line-height:1.6;white-space:pre-wrap">${corpo}</div>
    <div style="padding:12px 20px;border-top:1px solid #d8dee4;color:#59636e;font-size:12px">
      Painel de Monitoramento — Infraestrutura e Backups
    </div>
  </div>
</body></html>`;
}
