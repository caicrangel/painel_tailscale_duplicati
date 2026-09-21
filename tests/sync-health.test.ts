import { describe, expect, it } from "vitest";
import { cicloAtrasado, LIMITE_CICLO_MINUTOS } from "@/lib/dashboard/queries";

const AGORA = new Date("2026-09-21T12:00:00Z");
const minutosAtras = (n: number) => new Date(AGORA.getTime() - n * 60_000);

describe("cicloAtrasado", () => {
  it("manutenção roda de hora em hora e não pode parecer atrasada em 20 min", () => {
    expect(cicloAtrasado("MAINTENANCE", minutosAtras(20), AGORA)).toBe(false);
    expect(cicloAtrasado("MAINTENANCE", minutosAtras(90), AGORA)).toBe(false);
  });

  it("manutenção parada por 4 horas é problema de verdade", () => {
    expect(cicloAtrasado("MAINTENANCE", minutosAtras(240), AGORA)).toBe(true);
  });

  it("sync do Tailscale roda a cada 2 min: 20 min parado é problema", () => {
    expect(cicloAtrasado("TAILSCALE", minutosAtras(10), AGORA)).toBe(false);
    expect(cicloAtrasado("TAILSCALE", minutosAtras(20), AGORA)).toBe(true);
  });

  it("detecção de atraso tem folga maior que o sync", () => {
    expect(cicloAtrasado("LATE_CHECK", minutosAtras(18), AGORA)).toBe(false);
    expect(cicloAtrasado("LATE_CHECK", minutosAtras(25), AGORA)).toBe(true);
  });

  it("kind desconhecido usa o limite padrão em vez de alarmar à toa", () => {
    expect(cicloAtrasado("ALGO_NOVO", minutosAtras(30), AGORA)).toBe(false);
    expect(cicloAtrasado("ALGO_NOVO", minutosAtras(90), AGORA)).toBe(true);
  });

  it("todo ciclo agendado tem limite maior que a própria frequência", () => {
    expect(LIMITE_CICLO_MINUTOS.TAILSCALE).toBeGreaterThan(2);
    expect(LIMITE_CICLO_MINUTOS.LATE_CHECK).toBeGreaterThan(5);
    expect(LIMITE_CICLO_MINUTOS.MAINTENANCE).toBeGreaterThan(60);
  });
});
