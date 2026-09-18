import { describe, expect, it } from "vitest";
import {
  calcularStatusJob,
  carenciaInicial,
  derivarStatusMaquina,
  minutosOffline,
  type AvaliacaoJobInput,
} from "@/lib/jobs/late";

const AGORA = new Date("2026-09-18T12:00:00Z");
const h = (n: number) => n * 60;

function job(over: Partial<AvaliacaoJobInput> = {}): AvaliacaoJobInput {
  return {
    lastRunAt: new Date("2026-09-17T12:00:00Z"), // 24h atrás
    lastParsedResult: "SUCCESS",
    expectedIntervalMinutes: h(24),
    toleranceMinutes: h(6),
    graceUntil: null,
    paused: false,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    now: AGORA,
    ...over,
  };
}

describe("calcularStatusJob — janela e tolerância", () => {
  it("dentro do intervalo: status vem do último resultado", () => {
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-09-18T06:00:00Z") }));
    expect(r.status).toBe("OK");
    expect(r.isLate).toBe(false);
  });

  it("passou do intervalo mas ainda dentro da tolerância: não está atrasado", () => {
    // última execução 27h atrás; janela 24h + 6h = 30h
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-09-17T09:00:00Z") }));
    expect(r.isLate).toBe(false);
    expect(r.status).toBe("OK");
  });

  it("no exato instante do deadline ainda NÃO está atrasado", () => {
    const lastRunAt = new Date(AGORA.getTime() - h(30) * 60_000);
    const r = calcularStatusJob(job({ lastRunAt }));
    expect(r.deadline?.getTime()).toBe(AGORA.getTime());
    expect(r.isLate).toBe(false);
  });

  it("um minuto após o deadline vira LATE", () => {
    const lastRunAt = new Date(AGORA.getTime() - (h(30) + 1) * 60_000);
    const r = calcularStatusJob(job({ lastRunAt }));
    expect(r.status).toBe("LATE");
    expect(r.isLate).toBe(true);
    expect(r.lateByMinutes).toBe(1);
  });

  it("calcula quantos minutos de atraso acumulou", () => {
    // o cenário que dói: 5 dias sem backup
    const lastRunAt = new Date(AGORA.getTime() - h(24 * 5) * 60_000);
    const r = calcularStatusJob(job({ lastRunAt }));
    expect(r.status).toBe("LATE");
    expect(r.lateByMinutes).toBe(h(24 * 5) - h(30));
  });

  it("expõe a próxima execução esperada", () => {
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-09-18T02:00:00Z") }));
    expect(r.nextExpectedAt?.toISOString()).toBe("2026-09-19T02:00:00.000Z");
    expect(r.deadline?.toISOString()).toBe("2026-09-19T08:00:00.000Z");
  });

  it("tolerância zero: atrasa assim que passa do intervalo", () => {
    const lastRunAt = new Date(AGORA.getTime() - (h(24) + 1) * 60_000);
    const r = calcularStatusJob(job({ lastRunAt, toleranceMinutes: 0 }));
    expect(r.isLate).toBe(true);
  });
});

describe("calcularStatusJob — status derivado do resultado", () => {
  it.each([
    ["SUCCESS", "OK"],
    ["WARNING", "WARNING"],
    ["ERROR", "ERROR"],
    ["FATAL", "ERROR"],
    ["UNKNOWN", "UNKNOWN"],
  ] as const)("%s vira %s", (resultado, esperado) => {
    const r = calcularStatusJob(
      job({ lastRunAt: new Date("2026-09-18T11:00:00Z"), lastParsedResult: resultado }),
    );
    expect(r.status).toBe(esperado);
  });

  it("atraso tem precedência sobre o último resultado bem-sucedido", () => {
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-09-10T12:00:00Z") }));
    expect(r.status).toBe("LATE");
  });
});

describe("calcularStatusJob — job que nunca executou", () => {
  it("usa a criação como âncora e marca nuncaExecutou", () => {
    const r = calcularStatusJob(
      job({ lastRunAt: null, lastParsedResult: null, createdAt: new Date("2026-09-01T00:00:00Z") }),
    );
    expect(r.nuncaExecutou).toBe(true);
    expect(r.status).toBe("LATE");
  });

  it("job recém-cadastrado dentro da carência não alerta", () => {
    const r = calcularStatusJob(
      job({
        lastRunAt: null,
        lastParsedResult: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        graceUntil: new Date("2026-09-19T00:00:00Z"),
      }),
    );
    expect(r.status).toBe("UNKNOWN");
    expect(r.isLate).toBe(false);
  });

  it("depois que a carência vence, volta a ser avaliado", () => {
    const r = calcularStatusJob(
      job({
        lastRunAt: null,
        lastParsedResult: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        graceUntil: new Date("2026-09-17T00:00:00Z"),
      }),
    );
    expect(r.status).toBe("LATE");
  });
});

describe("calcularStatusJob — pausado e inativo", () => {
  it("job pausado nunca atrasa", () => {
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-01-01T00:00:00Z"), paused: true }));
    expect(r.status).toBe("PAUSED");
    expect(r.isLate).toBe(false);
  });

  it("job inativo nunca atrasa", () => {
    const r = calcularStatusJob(job({ lastRunAt: new Date("2026-01-01T00:00:00Z"), active: false }));
    expect(r.status).toBe("PAUSED");
    expect(r.isLate).toBe(false);
  });
});

describe("derivarStatusMaquina", () => {
  const base = { now: AGORA, onlineMaxMinutes: 5, idleMaxMinutes: 60 };

  it.each([
    [0, "ONLINE"],
    [4, "ONLINE"],
    [5, "IDLE"],
    [59, "IDLE"],
    [60, "OFFLINE"],
    [60 * 24 * 5, "OFFLINE"],
  ] as const)("%s minutos sem contato → %s", (minutos, esperado) => {
    const lastSeen = new Date(AGORA.getTime() - minutos * 60_000);
    expect(derivarStatusMaquina({ ...base, lastSeen })).toBe(esperado);
  });

  it("sem lastSeen o status é UNKNOWN, não OFFLINE", () => {
    expect(derivarStatusMaquina({ ...base, lastSeen: null })).toBe("UNKNOWN");
  });

  it("lastSeen no futuro (relógio adiantado) conta como online", () => {
    const lastSeen = new Date(AGORA.getTime() + 10 * 60_000);
    expect(derivarStatusMaquina({ ...base, lastSeen })).toBe("ONLINE");
  });

  it("respeita limiares customizados", () => {
    const lastSeen = new Date(AGORA.getTime() - 10 * 60_000);
    expect(
      derivarStatusMaquina({ lastSeen, now: AGORA, onlineMaxMinutes: 15, idleMaxMinutes: 30 }),
    ).toBe("ONLINE");
  });
});

describe("auxiliares", () => {
  it("minutosOffline nunca é negativo", () => {
    expect(minutosOffline(new Date(AGORA.getTime() + 60_000), AGORA)).toBe(0);
    expect(minutosOffline(new Date(AGORA.getTime() - 3 * 60_000), AGORA)).toBe(3);
    expect(minutosOffline(null, AGORA)).toBeNull();
  });

  it("carenciaInicial dá um intervalo inteiro de folga", () => {
    expect(carenciaInicial(h(24), AGORA).toISOString()).toBe("2026-09-19T12:00:00.000Z");
  });
});
