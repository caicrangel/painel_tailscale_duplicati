import { describe, expect, it } from "vitest";
import { extrairPayload } from "@/lib/duplicati/body";

const RELATORIO = '{"Data":{"ParsedResult":"Success"},"Extra":{"backup-id":"DB-1"}}';

describe("extrairPayload — JSON", () => {
  it("lê corpo JSON declarado", () => {
    const r = extrairPayload(RELATORIO, "application/json");
    expect(r.formato).toBe("json");
    expect((r.payload as { Data: { ParsedResult: string } }).Data.ParsedResult).toBe("Success");
  });

  it("lê JSON mesmo com Content-Type ausente", () => {
    const r = extrairPayload(RELATORIO, null);
    expect(r.formato).toBe("json");
    expect(r.payload).not.toBeNull();
  });

  it("lê JSON mesmo com charset no Content-Type", () => {
    const r = extrairPayload(RELATORIO, "application/json; charset=utf-8");
    expect(r.formato).toBe("json");
  });
});

describe("extrairPayload — form-urlencoded", () => {
  it("acha o relatório no campo padrão message", () => {
    const corpo = `message=${encodeURIComponent(RELATORIO)}`;
    const r = extrairPayload(corpo, "application/x-www-form-urlencoded");
    expect(r.formato).toBe("form");
    expect(r.campo).toBe("message");
    expect(r.payload).not.toBeNull();
  });

  it("acha o relatório em campo não padronizado", () => {
    const corpo = `extra=1&relatorio-do-duplicati=${encodeURIComponent(RELATORIO)}`;
    const r = extrairPayload(corpo, "application/x-www-form-urlencoded");
    expect(r.formato).toBe("form");
    expect(r.campo).toBe("relatorio-do-duplicati");
  });

  it("reporta quando nenhum campo tem JSON", () => {
    const r = extrairPayload("status=ok&host=srv1", "application/x-www-form-urlencoded");
    expect(r.payload).toBeNull();
    expect(r.erro).toBeTruthy();
  });
});

describe("extrairPayload — degenerados", () => {
  it("corpo vazio é reportado, não lançado", () => {
    const r = extrairPayload("", "application/json");
    expect(r.payload).toBeNull();
    expect(r.erro).toBe("Corpo vazio.");
  });

  it("JSON inválido declarado como JSON é reportado", () => {
    const r = extrairPayload('{"Data": ', "application/json");
    expect(r.payload).toBeNull();
    expect(r.erro).toContain("JSON inválido");
  });

  it("texto puro contendo JSON ainda é aceito", () => {
    const r = extrairPayload(RELATORIO, "text/plain");
    expect(r.payload).not.toBeNull();
  });

  it("texto que não é JSON nem form é reportado", () => {
    const r = extrairPayload("backup terminou", "text/plain");
    expect(r.payload).toBeNull();
    expect(r.formato).toBe("desconhecido");
  });
});
