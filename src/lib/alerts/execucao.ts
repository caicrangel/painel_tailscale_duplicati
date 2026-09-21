import type { ParsedResult } from "@prisma/client";
import { extrairResumo } from "@/lib/duplicati/resumo";

/**
 * Recibo de execução: a mensagem enviada a cada backup concluído.
 *
 * O propósito é diferente do alerta. O alerta diz "algo precisa de atenção";
 * o recibo diz "rodou, e deu isto" — é o que permite saber que o backup das
 * 19h do cliente X aconteceu, sem precisar abrir o painel. Por isso ele nomeia
 * a empresa logo no título: cada cliente roda em horário próprio, e a mensagem
 * solta no chat precisa se identificar sozinha.
 *
 * Função pura, com os números vindos do payload bruto da execução.
 */

export type DadosExecucao = {
  cliente: string | null;
  maquina: string;
  job: string;
  parsedResult: ParsedResult;
  /** Payload bruto da execução, de onde saem os números. */
  rawPayload: unknown;
  /** Quando o relatório chegou (nosso relógio). */
  recebidoEm: Date;
  /** Duração e volume já parseados, usados quando o bruto não traz. */
  durationSeconds: number | null;
  bytesUploaded: bigint | number | null;
};

export type ReciboFormatado = { titulo: string; texto: string; html: string };

const EMOJI: Record<ParsedResult, string> = {
  SUCCESS: "✅",
  WARNING: "⚠️",
  ERROR: "❌",
  FATAL: "🛑",
  UNKNOWN: "❔",
};

const RESULTADO: Record<ParsedResult, string> = {
  SUCCESS: "Sucesso",
  WARNING: "Concluído com avisos",
  ERROR: "Erro",
  FATAL: "Falha grave",
  UNKNOWN: "Resultado não informado",
};

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bytesLegiveis(bytes: number | bigint | null): string | null {
  if (bytes === null) return null;
  let n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return null;
  const unidades = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < unidades.length - 1) {
    n /= 1024;
    i += 1;
  }
  const casas = i === 0 ? 0 : n < 10 ? 2 : 1;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[i]}`;
}

function duracaoLegivel(segundos: number | null): string | null {
  if (segundos === null || !Number.isFinite(segundos)) return null;
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min < 60) return resto ? `${min}min ${resto}s` : `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function hora(d: Date | null, timeZone: string): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function numero(n: number | null): string | null {
  return n === null ? null : n.toLocaleString("pt-BR");
}

export function formatarRecibo(
  dados: DadosExecucao,
  timeZone = "America/Sao_Paulo",
): ReciboFormatado {
  const resumo = extrairResumo(dados.rawPayload);

  const item = (secao: string, rotulo: string) =>
    resumo.secoes.find((s) => s.titulo === secao)?.itens.find((i) => i.rotulo === rotulo);

  const examinados = numero(item("Arquivos", "Examinados")?.quantidade ?? null);
  const adicionados = numero(item("Arquivos", "Adicionados")?.quantidade ?? null);
  const alterados = numero(item("Arquivos", "Alterados")?.quantidade ?? null);
  const excluidos = numero(item("Arquivos", "Excluídos")?.quantidade ?? null);

  const enviado =
    bytesLegiveis(item("Destino", "Enviado")?.bytes ?? null) ??
    bytesLegiveis(dados.bytesUploaded);
  const totalDestino = bytesLegiveis(item("Destino", "Tamanho total no destino")?.bytes ?? null);
  const versoes = numero(item("Destino", "Versões guardadas")?.quantidade ?? null);

  const duracao = duracaoLegivel(resumo.duracaoSegundos ?? dados.durationSeconds);
  const inicio = hora(resumo.inicio, timeZone);
  const fim = hora(resumo.fim ?? dados.recebidoEm, timeZone);

  // O cliente vem primeiro: no chat, a mensagem precisa se identificar sozinha.
  const titulo = `${EMOJI[dados.parsedResult]} Backup concluído — ${dados.cliente ?? "sem cliente"}`;

  const linhas: string[] = [titulo, ""];
  linhas.push(`Tarefa: ${dados.job}`);
  linhas.push(`Máquina: ${dados.maquina}`);
  linhas.push(`Resultado: ${RESULTADO[dados.parsedResult]}`);
  if (duracao) linhas.push(`Duração: ${duracao}`);
  if (inicio && fim) linhas.push(`Janela: ${inicio} → ${fim}`);
  else if (fim) linhas.push(`Concluído às ${fim}`);

  const arquivos = [
    examinados && `examinados ${examinados}`,
    adicionados && `adicionados ${adicionados}`,
    alterados && `alterados ${alterados}`,
    excluidos && excluidos !== "0" && `excluídos ${excluidos}`,
  ].filter(Boolean);

  if (arquivos.length > 0) {
    linhas.push("");
    linhas.push(`Arquivos: ${arquivos.join(" · ")}`);
  }

  const destino = [
    enviado && `enviado ${enviado}`,
    totalDestino && `total no destino ${totalDestino}`,
    versoes && `${versoes} versões`,
  ].filter(Boolean);

  if (destino.length > 0) linhas.push(`Destino: ${destino.join(" · ")}`);

  // Warning e erro trazem o motivo: sem ele, o recibo vira só uma cor.
  const problemas = [...resumo.erros.slice(0, 3), ...resumo.avisos.slice(0, 3)];
  if (problemas.length > 0) {
    linhas.push("");
    for (const p of problemas) linhas.push(`• ${p}`);
    const restantes =
      resumo.erros.length + resumo.avisos.length - problemas.length;
    if (restantes > 0) linhas.push(`… e mais ${restantes} mensagem(ns) no painel.`);
  }

  if (resumo.sinalizadores.length > 0) {
    linhas.push("");
    linhas.push(resumo.sinalizadores.join(" · "));
  }

  const texto = linhas.join("\n");
  const html = [`<b>${escapar(titulo)}</b>`, ...linhas.slice(1).map(escapar)].join("\n");

  return { titulo, texto, html };
}

/** Decide se este resultado deve virar recibo, conforme o escopo configurado. */
export function deveEnviarRecibo(
  parsedResult: ParsedResult,
  escopo: "TODAS" | "SOMENTE_SUCESSO" | "SOMENTE_FALHAS",
): boolean {
  switch (escopo) {
    case "TODAS":
      return true;
    case "SOMENTE_SUCESSO":
      return parsedResult === "SUCCESS";
    case "SOMENTE_FALHAS":
      return parsedResult === "ERROR" || parsedResult === "FATAL" || parsedResult === "WARNING";
  }
}
