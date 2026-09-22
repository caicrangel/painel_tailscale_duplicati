import type { ParsedResult } from "@prisma/client";
import { extrairResumo } from "@/lib/duplicati/resumo";
import {
  bytesLegiveis,
  cabecalhoTabela,
  campo,
  campoLongo,
  duracaoLegivel,
  linhaTabela,
  linhaValor,
  montarMensagem,
  numero,
  type MensagemFormatada,
} from "@/lib/alerts/formato";

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

export type ReciboFormatado = MensagemFormatada;

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

function hora(d: Date | null, timeZone: string): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}


export function formatarRecibo(
  dados: DadosExecucao,
  timeZone = "America/Sao_Paulo",
): ReciboFormatado {
  const resumo = extrairResumo(dados.rawPayload);

  const item = (secao: string, rotulo: string) =>
    resumo.secoes.find((s) => s.titulo === secao)?.itens.find((i) => i.rotulo === rotulo);

  const qtde = (secao: string, rotulo: string) => numero(item(secao, rotulo)?.quantidade ?? null);
  const tam = (secao: string, rotulo: string) => bytesLegiveis(item(secao, rotulo)?.bytes ?? null);

  const duracao = duracaoLegivel(resumo.duracaoSegundos ?? dados.durationSeconds);
  const inicio = hora(resumo.inicio, timeZone);
  const fim = hora(resumo.fim ?? dados.recebidoEm, timeZone);

  // O cliente vem primeiro: no chat, a mensagem precisa se identificar sozinha.
  const titulo = `${EMOJI[dados.parsedResult]} Backup concluído — ${dados.cliente ?? "sem cliente"}`;

  // ── Cabeçalho da execução ──
  const bloco: string[] = [];
  bloco.push(campoLongo("📋 Tarefa", dados.job));
  bloco.push(campoLongo("🖥️ Máquina", dados.maquina));
  if (resumo.operacao) bloco.push(campo("⚙️ Operação", resumo.operacao));
  bloco.push(campo(`${EMOJI[dados.parsedResult]} Resultado`, RESULTADO[dados.parsedResult]));
  if (duracao) bloco.push(campo("⏱️ Duração", duracao));
  if (inicio && fim) bloco.push(campo("🕐 Janela", `${inicio} → ${fim}`));
  else if (fim) bloco.push(campo("🕐 Concluído", fim));

  // ── Arquivos ──
  // Toda linha de arquivo mostra as duas colunas: um "-" na coluna de tamanho
  // diz "o Duplicati não reporta isso", e é informação. Coluna ausente só
  // deixaria a tabela irregular.
  const linhasArquivos = ["Adicionados", "Alterados", "Excluídos", "Abertos", "Examinados"]
    .filter((rotulo) => item("Arquivos", rotulo) !== undefined)
    .map((rotulo) => linhaTabela(rotulo, qtde("Arquivos", rotulo), tam("Arquivos", rotulo)));

  if (linhasArquivos.length > 0) {
    bloco.push("");
    bloco.push(cabecalhoTabela("📁 ARQUIVOS", true));
    bloco.push(...linhasArquivos);
  }

  // ── Pastas ──
  const pastas = ["Adicionadas", "Alteradas", "Excluídas"]
    .filter((rotulo) => item("Pastas", rotulo) !== undefined)
    .map((rotulo) => linhaTabela(rotulo, qtde("Pastas", rotulo)));

  if (pastas.length > 0) {
    bloco.push("");
    bloco.push(cabecalhoTabela("📂 PASTAS", false));
    bloco.push(...pastas);
  }

  // ── Destino ──
  const destino: string[] = [];
  const enviado = tam("Destino", "Enviado") ?? bytesLegiveis(dados.bytesUploaded);
  if (enviado) destino.push(linhaValor("Enviado", enviado));
  const total = tam("Destino", "Tamanho total no destino");
  if (total) destino.push(linhaValor("Total no destino", total));
  const versoes = qtde("Destino", "Versões guardadas");
  if (versoes) destino.push(linhaValor("Versões no destino", versoes));

  if (destino.length > 0) {
    bloco.push("");
    bloco.push("☁️ DESTINO");
    bloco.push(...destino);
  }

  if (resumo.sinalizadores.length > 0) {
    bloco.push("");
    bloco.push(`⚠️ ${resumo.sinalizadores.join(" · ")}`);
  }

  // Erros e avisos ficam FORA do bloco monoespaçado: são frases longas, que
  // dentro do <pre> não quebram linha e viram rolagem horizontal no celular.
  const problemas = [...resumo.erros.slice(0, 3), ...resumo.avisos.slice(0, 3)];
  const rodape: string[] = [];
  if (problemas.length > 0) {
    rodape.push("");
    for (const p of problemas) rodape.push(`• ${p}`);
    const restantes = resumo.erros.length + resumo.avisos.length - problemas.length;
    if (restantes > 0) rodape.push(`… e mais ${restantes} mensagem(ns) no painel.`);
  }

  return montarMensagem({ titulo, bloco, rodape });
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
