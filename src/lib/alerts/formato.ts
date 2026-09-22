/**
 * Régua tipográfica das mensagens do Telegram.
 *
 * Todo modelo — recibo, resumo, alerta, recuperação, teste — monta um bloco
 * monoespaçado (`<pre>`) com a mesma régua de colunas. É o que faz as mensagens
 * parecerem saídas do mesmo sistema, e é o único jeito de alinhar números:
 * em fonte proporcional "1" e "461.078" ocupam larguras diferentes e a coluna
 * entorta.
 *
 * Duas regras que vieram de erro real e não devem ser desfeitas:
 *
 *  • Emoji só em cabeçalho de seção. Dentro de linha de dados a largura de um
 *    emoji varia por plataforma e desloca tudo o que vem depois.
 *  • Frase longa fica FORA do `<pre>`. Dentro dele o Telegram não quebra linha,
 *    e a mensagem inteira vira rolagem horizontal no celular.
 */

export const LARGURA_ROTULO = 20;
export const LARGURA_QTDE = 9;
export const LARGURA_TAM = 12;

/**
 * Largura que um bloco pode ocupar antes de virar rolagem horizontal num
 * celular estreito. Acima disto, `campo` joga o valor para a linha de baixo.
 */
const LARGURA_ALVO = 41;

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
  const caracteres = [...texto];
  let largura = 0;

  for (let i = 0; i < caracteres.length; i += 1) {
    const cp = caracteres[i]!.codePointAt(0) ?? 0;
    if (cp === SELETOR_VARIACAO || cp === JUNTOR_LARGURA_ZERO) continue;

    // O seletor de variação logo em seguida é o que promove um símbolo a
    // emoji colorido — e com isso ele passa a ocupar duas colunas. Foi o que
    // desalinhou "▶️ EXECUÇÕES": U+25B6 sozinho é estreito, com FE0F não é.
    const proximo = caracteres[i + 1]?.codePointAt(0);
    const comSeletor = proximo === SELETOR_VARIACAO;

    const ehEmoji =
      cp >= 0x1f000 ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2b00 && cp <= 0x2bff) ||
      comSeletor;

    largura += ehEmoji ? 2 : 1;
  }

  return largura;
}

export function preencherFim(texto: string, largura: number): string {
  return texto + " ".repeat(Math.max(0, largura - larguraVisual(texto)));
}

export function preencherInicio(texto: string, largura: number): string {
  return " ".repeat(Math.max(0, largura - larguraVisual(texto))) + texto;
}

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Linha "Rótulo: valor" na régua comum. */
export function campo(rotulo: string, valor: string): string {
  return `${preencherFim(`${rotulo}:`, LARGURA_ROTULO)}${valor}`;
}

/**
 * Como `campo`, mas quebra o valor para a linha de baixo quando a linha
 * passaria da largura alvo. Nome de máquina como
 * "cliente-saolucas.tail3a6628.ts.net" não cabe ao lado do rótulo.
 */
export function campoLongo(rotulo: string, valor: string): string {
  const completa = campo(rotulo, valor);
  if (larguraVisual(completa) <= LARGURA_ALVO) return completa;
  return `${rotulo}:\n  ${valor}`;
}

/** Linha de tabela: rótulo à esquerda, quantidade e tamanho à direita. */
export function linhaTabela(rotulo: string, qtde: string | null, tamanho?: string | null): string {
  const inicio = preencherFim(`  ${rotulo}`, LARGURA_ROTULO);
  const meio = preencherInicio(qtde ?? "-", LARGURA_QTDE);
  if (tamanho === undefined) return `${inicio}${meio}`;
  return `${inicio}${meio}${preencherInicio(tamanho ?? "-", LARGURA_TAM)}`;
}

export function cabecalhoTabela(titulo: string, comTamanho: boolean): string {
  const inicio = preencherFim(titulo, LARGURA_ROTULO);
  const qtde = preencherInicio("qtde", LARGURA_QTDE);
  return comTamanho ? `${inicio}${qtde}${preencherInicio("tam.", LARGURA_TAM)}` : `${inicio}${qtde}`;
}

/** Linha de valor único, alinhada à direita na mesma régua das tabelas. */
export function linhaValor(rotulo: string, valor: string): string {
  return `${preencherFim(`  ${rotulo}`, LARGURA_ROTULO)}${preencherInicio(valor, LARGURA_QTDE + LARGURA_TAM)}`;
}

/** Item de lista, com continuação indentada quando o texto é longo. */
export function item(texto: string): string {
  return `  • ${texto}`;
}

export function bytesLegiveis(bytes: number | bigint | null): string | null {
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

export function duracaoLegivel(segundos: number | null): string | null {
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

export function numero(n: number | null): string | null {
  return n === null ? null : n.toLocaleString("pt-BR");
}

export type MensagemFormatada = { titulo: string; texto: string; html: string };

/**
 * Junta as três partes de toda mensagem: título em negrito, bloco monoespaçado
 * com os dados e rodapé em texto corrido (frases longas, links).
 */
export function montarMensagem(params: {
  titulo: string;
  bloco: string[];
  rodape?: string[];
}): MensagemFormatada {
  const rodape = params.rodape ?? [];

  const texto = [params.titulo, "", ...params.bloco, ...rodape].join("\n");

  const html = [
    `<b>${escaparHtml(params.titulo)}</b>`,
    "",
    `<pre>${escaparHtml(params.bloco.join("\n"))}</pre>`,
    ...rodape.map(escaparHtml),
  ].join("\n");

  return { titulo: params.titulo, texto, html };
}
