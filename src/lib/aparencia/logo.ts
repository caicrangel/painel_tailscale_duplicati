/**
 * Validação do arquivo de logo — função pura (regra 5 do CLAUDE.md).
 *
 * O tipo declarado pelo navegador não é prova de nada: confere os primeiros
 * bytes de cada formato. SVG é texto e pode carregar script; como o logo é
 * servido pelo próprio painel, um SVG com <script> aberto direto na barra de
 * endereço rodaria com a sessão do administrador. Por isso ele é recusado aqui
 * e, além disso, a rota que serve o arquivo manda CSP que bloqueia script.
 */

export const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export type TipoLogo = (typeof TIPOS_LOGO)[number];

/** Folgado para um logo, curto o bastante para não pesar no banco nem na página. */
export const TAMANHO_MAXIMO_LOGO = 256 * 1024;

export type ResultadoLogo = { ok: true; tipo: TipoLogo } | { ok: false; error: string };

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

function detectarTipo(bytes: Uint8Array): TipoLogo | null {
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // RIFF....WEBP
  if (comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  const inicio = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 1024))
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();
  if (inicio.startsWith("<svg") || (inicio.startsWith("<?xml") && inicio.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

const SVG_PERIGOSO = [
  /<script/i,
  /<foreignobject/i,
  /\son[a-z]+\s*=/i, // onload=, onclick=…
  /javascript:/i,
  /<!entity/i,
  /(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i, // recurso externo: vazaria que o painel foi aberto
];

export function validarLogo(bytes: Uint8Array): ResultadoLogo {
  if (bytes.length === 0) return { ok: false, error: "O arquivo está vazio." };
  if (bytes.length > TAMANHO_MAXIMO_LOGO) {
    return {
      ok: false,
      error: `O logo tem ${Math.ceil(bytes.length / 1024)} KB; o limite é ${TAMANHO_MAXIMO_LOGO / 1024} KB.`,
    };
  }

  const tipo = detectarTipo(bytes);
  if (!tipo) return { ok: false, error: "Formato não reconhecido. Use PNG, JPG, WEBP ou SVG." };

  if (tipo === "image/svg+xml") {
    const texto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (SVG_PERIGOSO.some((re) => re.test(texto))) {
      return {
        ok: false,
        error: "O SVG contém script, evento ou recurso externo. Exporte um SVG simples ou use PNG.",
      };
    }
  }

  return { ok: true, tipo };
}
