import { describe, expect, it } from "vitest";
import { fmtBytes, fmtDuracao, fmtIntervalo, fmtRelativo } from "@/lib/utils/format";

describe("fmtBytes", () => {
  it("formata em pt-BR escalando a unidade", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1024)).toBe("1,00 KB");
    expect(fmtBytes(5 * 1024 * 1024 * 1024)).toBe("5,00 GB");
  });

  it("aceita BigInt e trata nulo", () => {
    expect(fmtBytes(BigInt(2048))).toBe("2,00 KB");
    expect(fmtBytes(null)).toBe("—");
  });
});

describe("fmtDuracao", () => {
  it("cobre segundos, minutos e horas", () => {
    expect(fmtDuracao(45)).toBe("45s");
    expect(fmtDuracao(90)).toBe("1min 30s");
    expect(fmtDuracao(3600)).toBe("1h");
    expect(fmtDuracao(4320)).toBe("1h 12min");
    expect(fmtDuracao(null)).toBe("—");
  });
});

describe("fmtRelativo", () => {
  const now = new Date("2026-09-18T12:00:00Z");

  it("passado e futuro", () => {
    expect(fmtRelativo(new Date("2026-09-18T11:57:00Z"), now)).toBe("há 3 min");
    expect(fmtRelativo(new Date("2026-09-18T14:00:00Z"), now)).toBe("em 2 h");
    expect(fmtRelativo(new Date("2026-09-13T12:00:00Z"), now)).toBe("há 5 d");
  });

  it("nunca reportado", () => {
    expect(fmtRelativo(null, now)).toBe("nunca");
  });
});

describe("fmtIntervalo", () => {
  it("traduz minutos para linguagem de operação", () => {
    expect(fmtIntervalo(1440)).toBe("diário");
    expect(fmtIntervalo(2880)).toBe("a cada 2 dias");
    expect(fmtIntervalo(360)).toBe("a cada 6h");
    expect(fmtIntervalo(30)).toBe("a cada 30min");
  });
});
