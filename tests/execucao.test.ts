import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deveEnviarRecibo, formatarRecibo, type DadosExecucao } from "@/lib/alerts/execucao";

const fixture = (nome: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/duplicati/${nome}`, import.meta.url), "utf8"));

function dados(over: Partial<DadosExecucao> = {}): DadosExecucao {
  return {
    cliente: "Contabilidade Modelo",
    maquina: "srv-fiscal-01",
    job: "Dados Fiscais",
    parsedResult: "SUCCESS",
    rawPayload: fixture("sucesso-2.0.8.json"),
    recebidoEm: new Date("2026-09-21T22:12:44Z"),
    durationSeconds: 764,
    bytesUploaded: BigInt("2465923072"),
    ...over,
  };
}

describe("formatarRecibo — identificação", () => {
  it("nomeia a empresa no título, que é o que identifica a mensagem no chat", () => {
    const r = formatarRecibo(dados());
    expect(r.titulo).toBe("✅ Backup concluído — Contabilidade Modelo");
    expect(r.texto.startsWith("✅ Backup concluído — Contabilidade Modelo")).toBe(true);
  });

  it("traz tarefa e máquina, porque um cliente tem vários jobs", () => {
    const r = formatarRecibo(dados());
    expect(r.texto).toContain("Tarefa: Dados Fiscais");
    expect(r.texto).toContain("Máquina: srv-fiscal-01");
  });

  it("máquina sem cliente ainda gera recibo identificável", () => {
    const r = formatarRecibo(dados({ cliente: null }));
    expect(r.titulo).toContain("sem cliente");
  });

  it.each([
    ["SUCCESS", "✅", "Sucesso"],
    ["WARNING", "⚠️", "Concluído com avisos"],
    ["ERROR", "❌", "Erro"],
    ["FATAL", "🛑", "Falha grave"],
  ] as const)("%s usa emoji e rótulo próprios", (resultado, emoji, rotulo) => {
    const r = formatarRecibo(dados({ parsedResult: resultado }));
    expect(r.titulo.startsWith(emoji)).toBe(true);
    expect(r.texto).toContain(`Resultado: ${rotulo}`);
  });
});

describe("formatarRecibo — números da execução", () => {
  const r = formatarRecibo(dados());

  it("traz duração e janela no fuso da operação", () => {
    expect(r.texto).toContain("Duração: 12min 44s");
    // 03:00 UTC = 00:00 em São Paulo
    expect(r.texto).toContain("Janela: 00:00 → 00:12");
  });

  it("traz a contagem de arquivos", () => {
    expect(r.texto).toContain("examinados 48.213");
    expect(r.texto).toContain("adicionados 15");
    expect(r.texto).toContain("alterados 12");
  });

  it("traz o volume enviado e o tamanho no destino", () => {
    expect(r.texto).toContain("enviado 2,30 GB");
    expect(r.texto).toContain("total no destino 384,0 GB");
    expect(r.texto).toContain("30 versões");
  });
});

describe("formatarRecibo — problemas e degenerados", () => {
  it("warning traz o motivo, não só a cor", () => {
    const r = formatarRecibo(
      dados({ parsedResult: "WARNING", rawPayload: fixture("warning-cultura-us.json") }),
    );
    expect(r.texto).toContain("pagefile.sys");
  });

  it("erro traz a mensagem do Duplicati", () => {
    const r = formatarRecibo(
      dados({ parsedResult: "FATAL", rawPayload: fixture("erro-minimo.json") }),
    );
    expect(r.texto).toContain("Failed to connect to S3");
  });

  it("limita a lista e avisa que há mais no painel", () => {
    const r = formatarRecibo(
      dados({
        parsedResult: "WARNING",
        rawPayload: { Data: { Warnings: Array.from({ length: 10 }, (_, i) => `aviso ${i}`) } },
      }),
    );
    expect(r.texto).toContain("e mais 7 mensagem(ns) no painel");
  });

  it("payload ilegível ainda produz um recibo com o essencial", () => {
    const r = formatarRecibo(
      dados({ rawPayload: { _naoInterpretado: "lixo" }, durationSeconds: null, bytesUploaded: null }),
    );
    expect(r.texto).toContain("Tarefa: Dados Fiscais");
    expect(r.texto).not.toContain("undefined");
    expect(r.texto).not.toContain("null");
  });

  it("escapa marcação na versão HTML do Telegram", () => {
    const r = formatarRecibo(dados({ job: "Backup <script>" }));
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("marca backup parcial ou interrompido", () => {
    const r = formatarRecibo(
      dados({ rawPayload: { Data: { PartialBackup: true, ParsedResult: "Success" } } }),
    );
    expect(r.texto).toContain("Backup parcial");
  });
});

describe("deveEnviarRecibo", () => {
  it("TODAS deixa passar qualquer resultado", () => {
    expect(deveEnviarRecibo("SUCCESS", "TODAS")).toBe(true);
    expect(deveEnviarRecibo("ERROR", "TODAS")).toBe(true);
    expect(deveEnviarRecibo("UNKNOWN", "TODAS")).toBe(true);
  });

  it("SOMENTE_SUCESSO evita duplicar o que já vira alerta", () => {
    expect(deveEnviarRecibo("SUCCESS", "SOMENTE_SUCESSO")).toBe(true);
    expect(deveEnviarRecibo("ERROR", "SOMENTE_SUCESSO")).toBe(false);
    expect(deveEnviarRecibo("WARNING", "SOMENTE_SUCESSO")).toBe(false);
  });

  it("SOMENTE_FALHAS ignora os sucessos", () => {
    expect(deveEnviarRecibo("SUCCESS", "SOMENTE_FALHAS")).toBe(false);
    expect(deveEnviarRecibo("WARNING", "SOMENTE_FALHAS")).toBe(true);
    expect(deveEnviarRecibo("FATAL", "SOMENTE_FALHAS")).toBe(true);
  });
});
