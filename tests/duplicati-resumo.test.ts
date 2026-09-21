import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extrairResumo, resumoVazio } from "@/lib/duplicati/resumo";

const fixture = (nome: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/duplicati/${nome}`, import.meta.url), "utf8"));

function itens(resumo: ReturnType<typeof extrairResumo>, secao: string) {
  return resumo.secoes.find((s) => s.titulo === secao)?.itens ?? [];
}

function valor(resumo: ReturnType<typeof extrairResumo>, secao: string, rotulo: string) {
  return itens(resumo, secao).find((i) => i.rotulo === rotulo);
}

describe("extrairResumo — payload completo", () => {
  const r = extrairResumo(fixture("sucesso-2.0.8.json"));

  it("traz o cabeçalho da execução", () => {
    expect(r.operacao).toBe("Backup");
    expect(r.resultado).toBe("SUCCESS");
    expect(r.versao).toContain("2.0.8.1");
    expect(r.duracaoSegundos).toBe(764);
    expect(r.inicio?.toISOString()).toBe("2026-09-18T03:00:01.102Z");
  });

  it("agrupa os números de arquivos com quantidade e tamanho", () => {
    expect(valor(r, "Arquivos", "Adicionados")).toEqual({
      rotulo: "Adicionados",
      quantidade: 15,
      bytes: BigInt(1048576),
    });
    expect(valor(r, "Arquivos", "Examinados")?.quantidade).toBe(48213);
    expect(valor(r, "Arquivos", "Examinados")?.bytes).toBe(BigInt("187904819200"));
  });

  it("traz pastas e destino", () => {
    expect(valor(r, "Pastas", "Adicionadas")?.quantidade).toBe(1);
    expect(valor(r, "Destino", "Enviado")?.bytes).toBe(BigInt("2465923072"));
    expect(valor(r, "Destino", "Versões guardadas")?.quantidade).toBe(30);
    expect(valor(r, "Destino", "Chamadas ao destino")?.quantidade).toBe(19);
  });

  it("não inventa seções para o que o payload não traz", () => {
    // O fixture tem symlinks zerados, então a seção existe; já "não incluídos"
    // aparece porque FilesWithError/TooLargeFiles vêm no payload.
    expect(r.secoes.map((s) => s.titulo)).toContain("Arquivos");
    expect(resumoVazio(r)).toBe(false);
  });

  it("não marca sinalizador quando está tudo normal", () => {
    expect(r.sinalizadores).toEqual([]);
  });
});

describe("extrairResumo — warnings e erros", () => {
  it("mostra o texto do warning, não só a contagem", () => {
    const r = extrairResumo(fixture("warning-cultura-us.json"));
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain("pagefile.sys");
  });

  it("mostra o texto do erro", () => {
    const r = extrairResumo(fixture("erro-minimo.json"));
    expect(r.resultado).toBe("FATAL");
    expect(r.erros[0]).toContain("Failed to connect to S3");
  });

  it("limita a lista para não explodir a tela com log gigante", () => {
    const r = extrairResumo({
      Data: { Warnings: Array.from({ length: 500 }, (_, i) => `aviso ${i}`) },
    });
    expect(r.avisos).toHaveLength(20);
  });
});

describe("extrairResumo — sinalizadores", () => {
  it("avisa quando o backup foi parcial ou interrompido", () => {
    const r = extrairResumo({
      Data: { PartialBackup: true, Interrupted: true, Dryrun: true },
    });
    expect(r.sinalizadores).toEqual(["Backup parcial", "Interrompido", "Simulação (dry-run)"]);
  });

  it("avisa sobre erro de quota no destino", () => {
    const r = extrairResumo({ Data: { BackendStatistics: { ReportedQuotaError: true } } });
    expect(r.sinalizadores).toContain("Erro de quota no destino");
  });
});

describe("extrairResumo — degenerados", () => {
  it("payload não interpretado devolve resumo vazio, sem lançar", () => {
    const r = extrairResumo({ _naoInterpretado: "backup terminou" });
    expect(resumoVazio(r)).toBe(true);
    expect(r.secoes).toEqual([]);
  });

  it("null e tipos errados não quebram", () => {
    expect(resumoVazio(extrairResumo(null))).toBe(true);
    expect(resumoVazio(extrairResumo("texto"))).toBe(true);
    expect(extrairResumo({ Data: { AddedFiles: "não é número" } }).secoes).toEqual([]);
  });

  it("item sem quantidade nem tamanho não aparece", () => {
    const r = extrairResumo({ Data: { AddedFiles: 5 } });
    expect(itens(r, "Arquivos").map((i) => i.rotulo)).toEqual(["Adicionados"]);
  });
});
