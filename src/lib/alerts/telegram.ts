import { getTelegramConfig } from "@/lib/config/integracoes";
import {
  campo,
  campoLongo,
  montarMensagem,
  type MensagemFormatada,
} from "@/lib/alerts/formato";

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
  /** Ignora o switch de habilitado — usado pelo botão "enviar teste". */
  forcar?: boolean;
}): Promise<ResultadoEnvio> {
  const config = await getTelegramConfig();

  if (!config.enabled && !params.forcar) {
    return { ok: false, erro: "Telegram desabilitado nas configurações." };
  }

  const token = config.botToken;
  const chat = params.chatId ?? config.chatId;

  if (!token) return { ok: false, erro: "Token do bot não configurado." };
  if (!chat) return { ok: false, erro: "Chat ID não configurado." };

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

const GRAVIDADE = {
  CRITICAL: "Crítico",
  WARNING: "Atenção",
  INFO: "Informativo",
} as const;

const TIPO: Record<string, string> = {
  BACKUP_FAILED: "Backup com erro",
  BACKUP_WARNING: "Backup com warning",
  BACKUP_LATE: "Backup atrasado",
  MACHINE_OFFLINE: "Máquina offline",
  MOUNT_FAILED: "Montagem com falha",
  MOUNT_REMOUNTED: "Ponto remontado",
  MOUNT_LATE: "Verificação de montagem parada",
};

export type DadosAlerta = {
  severity: "CRITICAL" | "WARNING" | "INFO";
  type?: string | null;
  title: string;
  message: string;
  clientName?: string | null;
  machineName?: string | null;
  jobName?: string | null;
  abertoEm?: Date | null;
  url?: string | null;
};

function dataHora(d: Date | null | undefined, timeZone: string): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Alerta aberto, na mesma régua do recibo de execução.
 *
 * O que identifica o incidente (cliente, máquina, job, quando abriu) vai no
 * bloco monoespaçado; a frase que explica o problema fica fora dele, porque
 * dentro do <pre> o Telegram não quebra linha.
 */
export function formatarMensagemAlerta(
  params: DadosAlerta,
  timeZone = "America/Sao_Paulo",
): MensagemFormatada {
  const titulo = `${EMOJI[params.severity]} ${params.title}`;

  const bloco: string[] = [];
  const tipo = params.type ? TIPO[params.type] : undefined;
  if (tipo) bloco.push(campo("Ocorrência", tipo));
  bloco.push(campo("Gravidade", GRAVIDADE[params.severity]));
  if (params.clientName) bloco.push(campoLongo("🏢 Cliente", params.clientName));
  if (params.machineName) bloco.push(campoLongo("🖥️ Máquina", params.machineName));
  if (params.jobName) bloco.push(campoLongo("📋 Tarefa", params.jobName));

  const aberto = dataHora(params.abertoEm, timeZone);
  if (aberto) bloco.push(campo("🕐 Aberto em", aberto));

  const rodape = ["", params.message];
  if (params.url) rodape.push("", params.url);

  return montarMensagem({ titulo, bloco, rodape });
}

/**
 * Recuperação, no mesmo formato do alerta: quem viu o incidente abrir precisa
 * reconhecer a mensagem que o fecha.
 */
export function formatarRecuperacao(
  params: {
    title: string;
    explicacao: string;
    type?: string | null;
    clientName?: string | null;
    machineName?: string | null;
    jobName?: string | null;
    abertoEm?: Date | null;
    fechadoEm?: Date | null;
  },
  timeZone = "America/Sao_Paulo",
): MensagemFormatada {
  const titulo = `✅ Resolvido — ${params.title}`;

  const bloco: string[] = [];
  const tipo = params.type ? TIPO[params.type] : undefined;
  if (tipo) bloco.push(campo("Ocorrência", tipo));
  if (params.clientName) bloco.push(campoLongo("🏢 Cliente", params.clientName));
  if (params.machineName) bloco.push(campoLongo("🖥️ Máquina", params.machineName));
  if (params.jobName) bloco.push(campoLongo("📋 Tarefa", params.jobName));

  const aberto = dataHora(params.abertoEm, timeZone);
  const fechado = dataHora(params.fechadoEm, timeZone);
  if (aberto) bloco.push(campo("🕐 Aberto em", aberto));
  if (fechado) bloco.push(campo("✅ Resolvido em", fechado));

  return montarMensagem({ titulo, bloco, rodape: ["", params.explicacao] });
}

/** Mensagem do botão "enviar teste", na mesma régua dos demais modelos. */
export function formatarTeste(agora: Date, timeZone = "America/Sao_Paulo"): MensagemFormatada {
  const bloco = [
    campoLongo("Origem", "Painel Infra & Backups"),
    campo("Canal", "Telegram"),
    campo("🕐 Enviado em", dataHora(agora, timeZone) ?? "agora"),
  ];

  return montarMensagem({
    titulo: "🔔 Teste de integração",
    bloco,
    rodape: ["", "Se você está lendo isto, o Telegram está configurado corretamente."],
  });
}
