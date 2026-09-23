import { describe, expect, it } from "vitest";
import { diaLocal, eixoDeDias, inicioDaJanela } from "@/lib/dashboard/dias";

const SP = "America/Sao_Paulo";

describe("eixo de dias da faixa", () => {
  it("usa o dia de São Paulo, não o de UTC", () => {
    // 22/09 às 21h em Brasília já é 23/09 em UTC. O eixo tem de terminar em 22.
    const noite = new Date("2026-09-23T00:37:00Z");
    expect(diaLocal(noite, SP)).toBe("2026-09-22");
    expect(eixoDeDias(30, noite, SP).at(-1)).toBe("2026-09-22");
  });

  it("de manhã o último dia é o de hoje", () => {
    const manha = new Date("2026-09-23T10:37:00Z");
    expect(eixoDeDias(30, manha, SP).at(-1)).toBe("2026-09-23");
  });

  it("devolve N dias consecutivos, do mais antigo ao mais recente", () => {
    const eixo = eixoDeDias(30, new Date("2026-09-23T10:37:00Z"), SP);

    expect(eixo).toHaveLength(30);
    expect(eixo[0]).toBe("2026-08-25");
    expect(eixo.at(-1)).toBe("2026-09-23");
    expect(new Set(eixo).size).toBe(30);
  });

  it("atravessa a virada de mês e o ano bissexto sem pular dia", () => {
    const eixo = eixoDeDias(5, new Date("2028-03-01T15:00:00Z"), SP);
    expect(eixo).toEqual([
      "2028-02-26",
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("a janela de busca começa antes do primeiro dia do eixo", () => {
    const eixo = eixoDeDias(30, new Date("2026-09-23T10:37:00Z"), SP);
    const desde = inicioDaJanela(eixo);

    // Folga suficiente para cobrir a meia-noite local do primeiro dia, que em
    // UTC cai depois da meia-noite UTC.
    expect(desde.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(desde.getTime()).toBeLessThan(new Date("2026-08-25T03:00:00Z").getTime());
  });

  it("uma timezone à frente de UTC também termina no dia local", () => {
    // Tóquio: 23/09 07:00 UTC já é 23/09 16:00 lá; e 22/09 20:00 UTC é dia 23.
    const eixo = eixoDeDias(3, new Date("2026-09-22T20:00:00Z"), "Asia/Tokyo");
    expect(eixo.at(-1)).toBe("2026-09-23");
  });
});
