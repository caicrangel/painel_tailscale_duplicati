import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO,
  SUPERFICIE_CLARA,
  SUPERFICIE_ESCURA,
  contraste,
  cssDaPaleta,
  derivarPaleta,
  hexValido,
} from "@/lib/aparencia/paleta";
import { TAMANHO_MAXIMO_LOGO, validarLogo } from "@/lib/aparencia/logo";

const texto = (s: string) => new TextEncoder().encode(s);

describe("paleta de destaque", () => {
  it("aceita só hex de seis dígitos", () => {
    expect(hexValido("#1a7f37")).toBe(true);
    expect(hexValido("#FFF")).toBe(false);
    expect(hexValido("red")).toBe(false);
    expect(hexValido("#1a7f37;}body{display:none")).toBe(false);
  });

  it.each(["#0b1f5c", "#f5e642", "#e11d48", "#10b981", "#000000", "#ffffff", "#7c3aed"])(
    "%s fica legível nos dois temas",
    (cor) => {
      const p = derivarPaleta(cor);
      expect(contraste(p.escuro.destaque, SUPERFICIE_ESCURA)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(p.claro.destaque, SUPERFICIE_CLARA)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    },
  );

  it("cor que já é legível passa sem alteração", () => {
    // #0969da é o azul do tema claro original: já tem 5:1 sobre branco.
    expect(derivarPaleta("#0969da").claro.destaque).toBe("#0969da");
  });

  it("azul-marinho é clareado no escuro e mantido no claro", () => {
    const p = derivarPaleta("#0b1f5c");
    expect(p.claro.destaque).toBe("#0b1f5c");
    expect(p.escuro.destaque).not.toBe("#0b1f5c");
  });

  it("gera CSS que vence o :root do globals.css nos dois temas", () => {
    const css = cssDaPaleta(derivarPaleta("#e11d48"));
    expect(css).toContain("html:root{--color-info:");
    expect(css).toContain('html:root[data-theme="light"]{--color-info:');
  });

  it("recusa injetar algo que não seja hex", () => {
    expect(() =>
      cssDaPaleta({
        escuro: { destaque: "red}body{x", fundo: "#00000022" },
        claro: { destaque: "#000000", fundo: "#00000014" },
      }),
    ).toThrow();
  });
});

describe("validação do logo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("reconhece PNG, JPG e WEBP pelos bytes, não pelo nome", () => {
    expect(validarLogo(png)).toEqual({ ok: true, tipo: "image/png" });
    expect(validarLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toEqual({ ok: true, tipo: "image/jpeg" });
    expect(validarLogo(texto("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toEqual({ ok: true, tipo: "image/webp" });
  });

  it("aceita SVG simples, com ou sem declaração XML", () => {
    expect(validarLogo(texto('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'))).toMatchObject({ ok: true });
    expect(validarLogo(texto('<?xml version="1.0"?>\n<svg><use href="#a"/></svg>'))).toMatchObject({ ok: true });
  });

  it.each([
    ["script", '<svg><script>alert(1)</script></svg>'],
    ["evento", '<svg onload="alert(1)"></svg>'],
    ["javascript:", '<svg><a href="javascript:alert(1)">x</a></svg>'],
    ["foreignObject", "<svg><foreignObject><body/></foreignObject></svg>"],
    ["recurso externo", '<svg><image href="https://rastreio.example/p.png"/></svg>'],
    ["entidade XML", '<?xml version="1.0"?><!DOCTYPE s [<!ENTITY x "y">]><svg/>'],
  ])("recusa SVG com %s", (_nome, conteudo) => {
    expect(validarLogo(texto(conteudo)).ok).toBe(false);
  });

  it("recusa arquivo que não é imagem mesmo com nome de imagem", () => {
    expect(validarLogo(texto("<html><body>oi</body></html>")).ok).toBe(false);
    expect(validarLogo(texto("MZ\u0090\u0000executavel")).ok).toBe(false);
  });

  it("recusa vazio e acima do limite", () => {
    expect(validarLogo(new Uint8Array())).toMatchObject({ ok: false });
    const grande = new Uint8Array(TAMANHO_MAXIMO_LOGO + 1);
    grande.set(png);
    expect(validarLogo(grande)).toMatchObject({ ok: false });
  });
});
