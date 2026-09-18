import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contarLista,
  getPath,
  lerBigInt,
  lerData,
  lerDuracao,
  lerNumero,
  normalizarLista,
  normalizarResultado,
  parseRelatorioDuplicati,
} from "@/lib/duplicati/payload";

const fixture = (nome: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/duplicati/${nome}`, import.meta.url), "utf8"));

describe("getPath", () => {
  it("lê caminho aninhado", () => {
    expect(getPath({ a: { b: { c: 1 } } }, "a.b.c")).toBe(1);
  });

  it("devolve undefined em vez de lançar quando o caminho não existe", () => {
    expect(getPath({}, "Data.BackendStatistics.BytesUploaded")).toBeUndefined();
    expect(getPath(null, "Data.X")).toBeUndefined();
    expect(getPath("texto", "Data.X")).toBeUndefined();
    expect(getPath({ Data: null }, "Data.X")).toBeUndefined();
  });
});

describe("coerção de números", () => {
  it("aceita number e string", () => {
    expect(lerNumero(42)).toBe(42);
    expect(lerNumero("42")).toBe(42);
    expect(lerNumero(" 1024 ")).toBe(1024);
  });

  it("devolve null para lixo, em vez de NaN", () => {
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero(null)).toBeNull();
    expect(lerNumero({})).toBeNull();
    expect(lerNumero(Number.NaN)).toBeNull();
  });

  it("lerBigInt rejeita negativos (ex.: AssignedQuotaSpace = -1)", () => {
    expect(lerBigInt(-1)).toBeNull();
    expect(lerBigInt("187904819200")).toBe(BigInt("187904819200"));
  });
});

describe("lerData", () => {
  it("lê ISO 8601 com 7 casas decimais", () => {
    const d = lerData("2026-09-18T03:12:44.8821374Z");
    expect(d?.toISOString()).toBe("2026-09-18T03:12:44.882Z");
  });

  it("lê formato de cultura en-US com AM/PM", () => {
    const d = lerData("9/17/2026 11:00:00 PM");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8); // setembro
    expect(d?.getDate()).toBe(17);
    expect(d?.getHours()).toBe(23);
  });

  it("trata meia-noite e meio-dia no formato 12h", () => {
    expect(lerData("1/2/2026 12:00:00 AM")?.getHours()).toBe(0);
    expect(lerData("1/2/2026 12:00:00 PM")?.getHours()).toBe(12);
  });

  it("lê dd/MM quando o dia é inequívoco (> 12)", () => {
    const d = lerData("25/12/2026 22:30:00");
    expect(d?.getDate()).toBe(25);
    expect(d?.getMonth()).toBe(11);
  });

  it("devolve null para data ilegível, sem lançar", () => {
    expect(lerData("não é data")).toBeNull();
    expect(lerData(undefined)).toBeNull();
    expect(lerData({})).toBeNull();
  });
});

describe("lerDuracao", () => {
  it("converte TimeSpan do .NET", () => {
    expect(lerDuracao("00:12:43.7797493")).toBe(764);
    expect(lerDuracao("01:00:00")).toBe(3600);
    expect(lerDuracao("1.02:00:00")).toBe(93600);
  });

  it("aceita número puro de segundos", () => {
    expect(lerDuracao(90)).toBe(90);
  });

  it("devolve null para lixo", () => {
    expect(lerDuracao("qualquer coisa")).toBeNull();
    expect(lerDuracao(undefined)).toBeNull();
  });
});

describe("listas de mensagens", () => {
  it("*ActualLength tem precedência sobre a lista truncada", () => {
    expect(contarLista(["a", "b"], 27)).toBe(27);
  });

  it("cai para o tamanho da lista quando não há ActualLength", () => {
    expect(contarLista(["a", "b"], undefined)).toBe(2);
  });

  it("aceita string única como uma mensagem", () => {
    expect(contarLista("um aviso", undefined)).toBe(1);
    expect(normalizarLista("um aviso")).toEqual(["um aviso"]);
  });

  it("ausência vira zero, não erro", () => {
    expect(contarLista(undefined, undefined)).toBe(0);
    expect(normalizarLista(undefined)).toEqual([]);
  });
});

describe("normalizarResultado", () => {
  it.each([
    ["Success", "SUCCESS"],
    ["success", "SUCCESS"],
    ["WARNING", "WARNING"],
    ["Error", "ERROR"],
    ["Fatal", "FATAL"],
  ] as const)("%s → %s", (entrada, esperado) => {
    expect(normalizarResultado(entrada)).toBe(esperado);
  });

  it("valor desconhecido vira UNKNOWN, nunca exceção", () => {
    expect(normalizarResultado("Explodiu")).toBe("UNKNOWN");
    expect(normalizarResultado(undefined)).toBe("UNKNOWN");
    expect(normalizarResultado(42)).toBe("UNKNOWN");
  });
});

describe("parseRelatorioDuplicati — payload real de sucesso", () => {
  const r = parseRelatorioDuplicati(fixture("sucesso-2.0.8.json"));

  it("extrai o resultado e a identificação", () => {
    expect(r.parsedResult).toBe("SUCCESS");
    expect(r.machineName).toBe("SRV-FISCAL-01");
    expect(r.machineId).toBe("8f2c1a94-6e4b-4d21-9a77-1c3e5f0b7d88");
    expect(r.backupId).toBe("DB-3");
    expect(r.backupName).toBe("Dados Fiscais");
    expect(r.duplicatiVersion).toContain("2.0.8.1");
  });

  it("extrai tempos e duração", () => {
    expect(r.beginTime?.toISOString()).toBe("2026-09-18T03:00:01.102Z");
    expect(r.endTime?.toISOString()).toBe("2026-09-18T03:12:44.882Z");
    expect(r.durationSeconds).toBe(764);
  });

  it("extrai métricas de volume, inclusive do BackendStatistics", () => {
    expect(r.sizeOfExaminedFiles).toBe(BigInt("187904819200"));
    expect(r.examinedFiles).toBe(BigInt(48213));
    expect(r.addedFiles).toBe(BigInt(15));
    expect(r.bytesUploaded).toBe(BigInt("2465923072"));
    expect(r.knownFileSize).toBe(BigInt("412316860416"));
  });

  it("não acumula avisos quando o payload está completo", () => {
    expect(r.avisos).toEqual([]);
  });
});

describe("parseRelatorioDuplicati — versão antiga, cultura en-US, números como string", () => {
  const r = parseRelatorioDuplicati(fixture("warning-cultura-us.json"));

  it("lê datas no formato de cultura", () => {
    expect(r.beginTime?.getHours()).toBe(23);
    expect(r.endTime).not.toBeNull();
  });

  it("coage números vindos como string", () => {
    expect(r.examinedFiles).toBe(BigInt(9120));
    expect(r.sizeOfExaminedFiles).toBe(BigInt("9812345678"));
    expect(r.bytesUploaded).toBe(BigInt("104857600"));
  });

  it("usa WarningsActualLength em vez do tamanho da lista truncada", () => {
    expect(r.parsedResult).toBe("WARNING");
    expect(r.warningsCount).toBe(3);
  });

  it("sem machine-id, ainda temos machine-name para resolver a máquina", () => {
    expect(r.machineId).toBeNull();
    expect(r.machineName).toBe("DESKTOP-CONTABIL");
  });
});

describe("parseRelatorioDuplicati — payload mínimo e degenerado", () => {
  it("payload só com erro ainda produz um relatório utilizável", () => {
    const r = parseRelatorioDuplicati(fixture("erro-minimo.json"));
    expect(r.parsedResult).toBe("FATAL");
    expect(r.errorsCount).toBe(1);
    expect(r.backupName).toBe("Banco de Dados");
    expect(r.backupId).toBeNull();
    expect(r.beginTime).toBeNull();
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it("objeto vazio não lança e devolve tudo nulo", () => {
    const r = parseRelatorioDuplicati({});
    expect(r.parsedResult).toBe("UNKNOWN");
    expect(r.bytesUploaded).toBeNull();
    expect(r.messagesCount).toBe(0);
  });

  it("payload que não é objeto é reportado como aviso, sem lançar", () => {
    expect(parseRelatorioDuplicati(null).avisos).toContain("Payload não é um objeto JSON.");
    expect(parseRelatorioDuplicati("texto solto").avisos.length).toBe(1);
    expect(parseRelatorioDuplicati(42).parsedResult).toBe("UNKNOWN");
  });

  it("campos com tipo errado não derrubam o parsing", () => {
    const r = parseRelatorioDuplicati({
      Data: {
        ParsedResult: { inesperado: true },
        BeginTime: 12345,
        SizeOfExaminedFiles: [],
        Messages: "uma mensagem só",
        BackendStatistics: "isto deveria ser um objeto",
      },
      Extra: { "backup-id": ["DB-1"] },
    });
    expect(r.parsedResult).toBe("UNKNOWN");
    expect(r.sizeOfExaminedFiles).toBeNull();
    expect(r.bytesUploaded).toBeNull();
    expect(r.messagesCount).toBe(1);
    expect(r.backupId).toBeNull();
  });

  it("deriva a duração do intervalo quando Duration não veio", () => {
    const r = parseRelatorioDuplicati({
      Data: {
        ParsedResult: "Success",
        BeginTime: "2026-09-18T03:00:00Z",
        EndTime: "2026-09-18T03:05:00Z",
      },
    });
    expect(r.durationSeconds).toBe(300);
  });
});
