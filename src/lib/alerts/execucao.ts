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

// ─── Montagem do bloco tabular ───────────────────────────────────────────────

/**
 * As linhas de detalhe vão num bloco monoespaçado (<pre> no Telegram).
 * É o que faz as colunas de quantidade e tamanho alinharem — em fonte
 * proporcional, "1" e "461078" ocupam larguras diferentes e a coluna entorta.
 *
 * Emoji fica só nos cabeçalhos de seção: dentro das linhas de dados, a largura
 * de um emoji varia por plataforma e desalinharia tudo o que vem depois.
 */
const LARGURA_ROTULO = 20;
const LARGURA_QTDE = 9;
const LARGURA_TAM = 12;

const SELETOR_VARIACAO = 0xfe0f;
const JUNTOR_LARGURA_ZERO = 0x200d;

/**
 * Largura visual em colunas de fonte monoespaçada.
 *
 * `padEnd` conta unidades UTF-16, e por isso erra com emoji: "✅" ocupa 1
 * unidade, "🖥️" ocupa 3 (par substituto + seletor de variação) — e as duas
 * ocupam 2 colunas na tela. Alinhar com padEnd deixa cada linha com um
 * deslocamento diferente, que foi exatamente o que entortou a tabela.
 */
export function larguraVisual(texto: string): number {
  let largura = 0;
  for (const caractere of texto) {
    const cp = caractere.codePointAt(0) ?? 0;
    if (cp === SELETOR_VARIACAO || cp === JUNTOR_LARGURA_ZERO) continue;
    const ehEmoji =
      cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff) ||
      (cp >= 0x2300 && cp <= 0x23ff && texto.includes("\u{FE0F}"));
    largura += ehEmoji ? 2 : 1;
  }
  return largura;
}

function preencherFim(texto: string, largura: number): string {
  return texto + " ".repeat(Math.max(0, largura - larguraVisual(texto)));
}

function preencherInicio(texto: string, largura: number): string {
  return " ".repeat(Math.max(0, largura - larguraVisual(texto))) + texto;
}

function linhaTabela(rotulo: string, qtde: string | null, tamanho?: string | null): string {
  const inicio = preencherFim(`  ${rotulo}`, LARGURA_ROTULO);
  const meio = preencherInicio(qtde ?? "-", LARGURA_QTDE);
  if (tamanho === undefined) return `${inicio}${meio}`;
  return `${inicio}${meio}${preencherInicio(tamanho ?? "-", LARGURA_TAM)}`;
}

function cabecalhoTabela(titulo: string, comTamanho: boolean): string {
  const inicio = preencherFim(titulo, LARGURA_ROTULO);
  const qtde = preencherInicio("qtde", LARGURA_QTDE);
  return comTamanho ? `${inicio}${qtde}${preencherInicio("tam.", LARGURA_TAM)}` : `${inicio}${qtde}`;
}

/** Linha de valor único, alinhada à direita na mesma régua das tabelas. */
function linhaValor(rotulo: string, valor: string): string {
  return `${preencherFim(`  ${rotulo}`, LARGURA_ROTULO)}${preencherInicio(valor, LARGURA_QTDE + LARGURA_TAM)}`;
}

function campo(rotulo: string, valor: string): string {
  return `${preencherFim(`${rotulo}:`, LARGURA_ROTULO)}${valor}`;
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
  bloco.push(campo("📋 Tarefa", dados.job));
  bloco.push(campo("🖥️ Máquina", dados.maquina));
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

  const texto = [titulo, "", ...bloco, ...rodape].join("\n");

  const html = [
    `<b>${escapar(titulo)}</b>`,
    "",
    `<pre>${escapar(bloco.join("\n"))}</pre>`,
    ...rodape.map(escapar),
  ].join("\n");

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
