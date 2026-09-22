import { describe, expect, it } from "vitest";
import { avaliarAtrasoMontagem } from "@/lib/mounts/late";

const now = new Date("2026-09-22T12:00:00Z");
const minutosAtras = (m: number) => new Date(now.getTime() - m * 60_000);

describe("avaliarAtrasoMontagem", () => {
  it("não julga máquina que nunca reportou", () => {
    const r = avaliarAtrasoMontagem({
      ultimaEm: null,
      intervaloMinutos: 60,
      toleranciaMinutos: 30,
      now,
    });
    expect(r).toEqual({ atrasada: false, minutosSemVerificacao: null });
  });

  it("intervalo nulo desliga a vigilância mas ainda conta o tempo", () => {
    const r = avaliarAtrasoMontagem({
      ultimaEm: minutosAtras(5_000),
      intervaloMinutos: null,
      toleranciaMinutos: 30,
      now,
    });
    expect(r.atrasada).toBe(false);
    expect(r.minutosSemVerificacao).toBe(5_000);
  });

  it("dentro do intervalo mais tolerância não está atrasada", () => {
    const r = avaliarAtrasoMontagem({
      ultimaEm: minutosAtras(89),
      intervaloMinutos: 60,
      toleranciaMinutos: 30,
      now,
    });
    expect(r.atrasada).toBe(false);
  });

  it("o limite exato ainda não é atraso", () => {
    const r = avaliarAtrasoMontagem({
      ultimaEm: minutosAtras(90),
      intervaloMinutos: 60,
      toleranciaMinutos: 30,
      now,
    });
    expect(r.atrasada).toBe(false);
  });

  it("passou do intervalo mais tolerância vira atraso", () => {
    const r = avaliarAtrasoMontagem({
      ultimaEm: minutosAtras(91),
      intervaloMinutos: 60,
      toleranciaMinutos: 30,
      now,
    });
    expect(r).toEqual({ atrasada: true, minutosSemVerificacao: 91 });
  });
});
