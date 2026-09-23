import { describe, expect, it } from "vitest";
import { diagnosticarSaude, type EntradaSaude } from "@/lib/sistema/saude";

const saudavel = (): EntradaSaude => ({
  banco: { ok: true, latenciaMs: 3, usoConexoes: 0.1 },
  ciclos: ["TAILSCALE", "LATE_CHECK", "ALERTS", "NOTIFY", "MAINTENANCE", "RESUMO"].map((kind) => ({
    kind,
    ok: true,
    atrasado: false,
  })),
  tailscaleConfigurado: true,
  notificacoesFalhas: 0,
});

describe("diagnosticarSaude", () => {
  it("tudo em dia é ok, sem problemas", () => {
    expect(diagnosticarSaude(saudavel())).toEqual({ nivel: "ok", problemas: [] });
  });

  it("banco fora do ar é falha", () => {
    const e = saudavel();
    e.banco = { ok: false, latenciaMs: null, usoConexoes: null };
    expect(diagnosticarSaude(e).nivel).toBe("falha");
  });

  it("banco lento ou com conexões quase esgotadas é atenção", () => {
    const lento = saudavel();
    lento.banco.latenciaMs = 900;
    expect(diagnosticarSaude(lento).nivel).toBe("atencao");

    const cheio = saudavel();
    cheio.banco.usoConexoes = 0.85;
    expect(diagnosticarSaude(cheio).nivel).toBe("atencao");
  });

  it("worker sem nenhum ciclo é falha", () => {
    const e = saudavel();
    e.ciclos = [];
    expect(diagnosticarSaude(e).nivel).toBe("falha");
  });

  it("todos os ciclos parados indica worker morto (falha)", () => {
    const e = saudavel();
    e.ciclos = e.ciclos.map((c) => ({ ...c, atrasado: true }));
    const d = diagnosticarSaude(e);
    expect(d.nivel).toBe("falha");
    expect(d.problemas).toHaveLength(1);
  });

  it("um ciclo parado é atenção; um ciclo com erro é falha", () => {
    const parado = saudavel();
    parado.ciclos[1] = { ...parado.ciclos[1]!, atrasado: true };
    expect(diagnosticarSaude(parado).nivel).toBe("atencao");

    const erro = saudavel();
    erro.ciclos[2] = { ...erro.ciclos[2]!, ok: false };
    expect(diagnosticarSaude(erro).nivel).toBe("falha");
  });

  it("ciclo essencial ausente é atenção", () => {
    const e = saudavel();
    e.ciclos = e.ciclos.filter((c) => c.kind !== "NOTIFY");
    const d = diagnosticarSaude(e);
    expect(d.nivel).toBe("atencao");
    expect(d.problemas[0]!.texto).toContain("NOTIFY");
  });

  it("sem Tailscale configurado não cobra o ciclo TAILSCALE, mas avisa", () => {
    const e = saudavel();
    e.tailscaleConfigurado = false;
    e.ciclos = e.ciclos.filter((c) => c.kind !== "TAILSCALE");
    const d = diagnosticarSaude(e);
    expect(d.problemas).toHaveLength(1);
    expect(d.problemas[0]!.texto).toContain("Tailscale");
  });

  it("notificação não entregue é atenção", () => {
    const e = saudavel();
    e.notificacoesFalhas = 4;
    expect(diagnosticarSaude(e).nivel).toBe("atencao");
  });
});
