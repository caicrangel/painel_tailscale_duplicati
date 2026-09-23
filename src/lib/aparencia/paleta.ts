/**
 * Cor de destaque escolhida pelo administrador → variantes para os dois temas.
 *
 * Função pura (regra 5 do CLAUDE.md). A mesma cor não serve para os dois
 * temas: um azul-marinho que fica ótimo como botão no tema claro some sobre o
 * fundo escuro, e um amarelo-limão bonito no escuro fica ilegível no claro. Por
 * isso a cor é ajustada — clareada ou escurecida no mínimo necessário — até
 * atingir contraste de leitura (WCAG AA, 4.5:1) contra a superfície de cada
 * tema. Quem escolhe uma cor já legível recebe exatamente a cor que escolheu.
 */

export type Rgb = { r: number; g: number; b: number };

export type Variantes = { destaque: string; fundo: string };
export type Paleta = { escuro: Variantes; claro: Variantes };

/** Superfícies onde o destaque vira texto ou fundo de botão (globals.css). */
export const SUPERFICIE_ESCURA = "#121820";
export const SUPERFICIE_CLARA = "#ffffff";
export const CONTRASTE_MINIMO = 4.5;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function hexValido(valor: string): boolean {
  return HEX.test(valor);
}

export function hexParaRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbParaHex({ r, g, b }: Rgb): string {
  const canal = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

function luminancia({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contraste(a: string, b: string): number {
  const la = luminancia(hexParaRgb(a));
  const lb = luminancia(hexParaRgb(b));
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

function misturar(cor: Rgb, alvo: Rgb, t: number): Rgb {
  return {
    r: cor.r + (alvo.r - cor.r) * t,
    g: cor.g + (alvo.g - cor.g) * t,
    b: cor.b + (alvo.b - cor.b) * t,
  };
}

/**
 * Aproxima a cor de branco (tema escuro) ou de preto (tema claro) em passos
 * de 2% até ela ser legível sobre a superfície. Para no primeiro passo que
 * serve — o ajuste é o mínimo, a cor continua reconhecível.
 */
function ajustarAte(hex: string, superficie: string, direcao: "clarear" | "escurecer"): string {
  const base = hexParaRgb(hex);
  const alvo = direcao === "clarear" ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

  for (let passo = 0; passo <= 50; passo += 1) {
    const candidata = rgbParaHex(misturar(base, alvo, passo / 50));
    if (contraste(candidata, superficie) >= CONTRASTE_MINIMO) return candidata;
  }
  return rgbParaHex(alvo);
}

export function derivarPaleta(hex: string): Paleta {
  const cor = hex.toLowerCase();
  const escuro = ajustarAte(cor, SUPERFICIE_ESCURA, "clarear");
  const claro = ajustarAte(cor, SUPERFICIE_CLARA, "escurecer");

  // Mesma opacidade que os "-dim" feitos à mão em globals.css usam em cada tema.
  return {
    escuro: { destaque: escuro, fundo: `${escuro}22` },
    claro: { destaque: claro, fundo: `${claro}14` },
  };
}

/**
 * CSS que sobrescreve o destaque. `html:root` ganha em especificidade de
 * `:root` de globals.css, então a ordem das folhas no <head> não importa.
 * Só entra hex validado aqui — é o que torna seguro injetar como <style>.
 */
export function cssDaPaleta(paleta: Paleta): string {
  for (const v of [paleta.escuro, paleta.claro]) {
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v.destaque) || !/^#[0-9a-f]{8}$/.test(v.fundo)) {
      throw new Error("paleta com cor fora do formato hex");
    }
  }
  return (
    `html:root{--color-info:${paleta.escuro.destaque};--color-info-dim:${paleta.escuro.fundo}}` +
    `html:root[data-theme="light"]{--color-info:${paleta.claro.destaque};--color-info-dim:${paleta.claro.fundo}}`
  );
}
