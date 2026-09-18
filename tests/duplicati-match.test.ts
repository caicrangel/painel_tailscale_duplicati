import { describe, expect, it } from "vitest";
import { chaveDoJob, mesmoHost, normalizarHostname } from "@/lib/duplicati/match";

describe("normalizarHostname", () => {
  it("baixa a caixa e corta o domínio MagicDNS", () => {
    expect(normalizarHostname("SRV-FISCAL-01.tail1234.ts.net")).toBe("srv-fiscal-01");
    expect(normalizarHostname("  Desktop-Contabil  ")).toBe("desktop-contabil");
  });

  it("devolve null para vazio e nulo", () => {
    expect(normalizarHostname("")).toBeNull();
    expect(normalizarHostname(null)).toBeNull();
    expect(normalizarHostname(undefined)).toBeNull();
  });
});

describe("mesmoHost", () => {
  it("casa ignorando caixa e domínio", () => {
    expect(mesmoHost("SRV-FISCAL-01", "srv-fiscal-01.tail1234.ts.net")).toBe(true);
  });

  it("não casa hostnames diferentes", () => {
    expect(mesmoHost("srv-fiscal-01", "srv-fiscal-02")).toBe(false);
  });

  it("nulo nunca casa — nem com outro nulo", () => {
    expect(mesmoHost(null, null)).toBe(false);
    expect(mesmoHost("srv", null)).toBe(false);
  });
});

describe("chaveDoJob", () => {
  it("prefere o backup-id", () => {
    expect(chaveDoJob("DB-3", "Dados Fiscais")).toBe("DB-3");
  });

  it("cai para o nome quando não há id", () => {
    expect(chaveDoJob(null, "Dados Fiscais")).toBe("name:dados fiscais");
  });

  it("sem id e sem nome, usa uma chave estável", () => {
    expect(chaveDoJob(null, null)).toBe("default");
  });

  it("é estável entre relatórios do mesmo job", () => {
    expect(chaveDoJob(null, "Dados Fiscais")).toBe(chaveDoJob(null, "  dados fiscais  "));
  });
});
