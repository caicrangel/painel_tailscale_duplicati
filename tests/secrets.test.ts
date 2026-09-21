import { beforeAll, describe, expect, it } from "vitest";
import { cifrar, decifrar, ehSegredoCifrado, mascarar } from "@/lib/config/secrets";

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = "chave-de-teste-nao-usar-em-producao";
});

describe("cifrar/decifrar", () => {
  it("vai e volta", () => {
    const segredo = "123456:ABC-DEF_bot-token-do-telegram";
    expect(decifrar(cifrar(segredo))).toBe(segredo);
  });

  it("o texto cifrado não contém o segredo", () => {
    const c = cifrar("senha-super-secreta");
    expect(JSON.stringify(c)).not.toContain("senha-super-secreta");
  });

  it("dois ciframentos do mesmo valor são diferentes (IV aleatório)", () => {
    expect(cifrar("igual").dados).not.toBe(cifrar("igual").dados);
  });

  it("payload adulterado falha em vez de devolver lixo", () => {
    const c = cifrar("valor");
    const adulterado = { ...c, dados: Buffer.from("outra coisa").toString("base64") };
    expect(decifrar(adulterado)).toBeNull();
  });

  it("chave diferente não decifra", () => {
    const c = cifrar("valor");
    process.env.SETTINGS_ENCRYPTION_KEY = "outra-chave";
    expect(decifrar(c)).toBeNull();
    process.env.SETTINGS_ENCRYPTION_KEY = "chave-de-teste-nao-usar-em-producao";
  });

  it("aceita segredo com acentos e emoji", () => {
    const s = "señha-com-ção-🔐";
    expect(decifrar(cifrar(s))).toBe(s);
  });
});

describe("ehSegredoCifrado", () => {
  it("reconhece o formato", () => {
    expect(ehSegredoCifrado(cifrar("x"))).toBe(true);
  });

  it("rejeita qualquer outra coisa", () => {
    expect(ehSegredoCifrado(null)).toBe(false);
    expect(ehSegredoCifrado("texto")).toBe(false);
    expect(ehSegredoCifrado({ iv: 1 })).toBe(false);
  });
});

describe("mascarar", () => {
  it("mostra só o fim", () => {
    const m = mascarar("1234567890abcd");
    expect(m?.endsWith("abcd")).toBe(true);
    expect(m).not.toContain("1234567890");
  });

  it("nulo continua nulo", () => {
    expect(mascarar(null)).toBeNull();
  });
});
