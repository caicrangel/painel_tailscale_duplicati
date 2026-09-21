import { getPath, lerData, lerNumero, lerTexto } from "@/lib/duplicati/payload";

/**
 * Parsing do relatório de verificação de montagens.
 *
 * Mesma disciplina do relatório do Duplicati: nada é obrigatório, nada lança, e
 * o payload bruto já foi gravado antes de chegar aqui. O script é nosso, mas
 * versões diferentes vão conviver nas máquinas dos clientes por meses — o
 * parser precisa aguentar a versão antiga e a nova ao mesmo tempo.
 *
 * Módulo puro.
 */

export type ResultadoMontagem = "OK" | "RECOVERED" | "FAILED" | "UNKNOWN";
export type StatusPonto = "OK" | "REMOUNTED" | "FAILED" | "UNKNOWN";

export type PontoMontagem = {
  path: string;
  status: StatusPonto;
  fsTypeExpected: string | null;
  fsTypeActual: string | null;
  detail: string | null;
  size: string | null;
  used: string | null;
  available: string | null;
  usePercent: string | null;
};

export type RelatorioMontagens = {
  host: string | null;
  result: ResultadoMontagem;
  pontos: PontoMontagem[];
  pointsTotal: number;
  pointsFailed: number;
  remounted: boolean;
  durationSeconds: number | null;
  startedAt: Date | null;
  bootAt: Date | null;
  bootRecent: boolean;
  avisos: string[];
};

function normalizarStatusPonto(valor: unknown): StatusPonto {
  switch (lerTexto(valor)?.toUpperCase()) {
    case "OK":
      return "OK";
    case "REMOUNTED":
    case "REMONTADO":
    case "RECOVERED":
      return "REMOUNTED";
    case "FAILED":
    case "FALHA":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

function normalizarResultado(valor: unknown): ResultadoMontagem {
  switch (lerTexto(valor)?.toUpperCase()) {
    case "OK":
      return "OK";
    case "RECOVERED":
    case "RECUPERADO":
      return "RECOVERED";
    case "FAILED":
    case "FALHA":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

function lerBooleano(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  const texto = lerTexto(valor)?.toLowerCase();
  return texto === "true" || texto === "1" || texto === "sim";
}

export function parseRelatorioMontagens(payload: unknown): RelatorioMontagens {
  const avisos: string[] = [];

  if (payload === null || typeof payload !== "object") {
    return {
      host: null,
      result: "UNKNOWN",
      pontos: [],
      pointsTotal: 0,
      pointsFailed: 0,
      remounted: false,
      durationSeconds: null,
      startedAt: null,
      bootAt: null,
      bootRecent: false,
      avisos: ["Payload não é um objeto JSON."],
    };
  }

  const brutos = getPath(payload, "points");
  const lista = Array.isArray(brutos) ? brutos : [];
  if (!Array.isArray(brutos)) avisos.push("Lista de pontos ausente ou em formato inesperado.");

  const pontos: PontoMontagem[] = [];
  for (const item of lista) {
    const path = lerTexto(getPath(item, "path"));
    if (!path) {
      avisos.push("Ponto sem caminho foi ignorado.");
      continue;
    }
    pontos.push({
      path,
      status: normalizarStatusPonto(getPath(item, "status")),
      fsTypeExpected: lerTexto(getPath(item, "fstypeExpected")),
      fsTypeActual: lerTexto(getPath(item, "fstypeActual")),
      detail: lerTexto(getPath(item, "detail")),
      size: lerTexto(getPath(item, "size")),
      used: lerTexto(getPath(item, "used")),
      available: lerTexto(getPath(item, "avail")) ?? lerTexto(getPath(item, "available")),
      usePercent: lerTexto(getPath(item, "usePercent")),
    });
  }

  const falhas = pontos.filter((p) => p.status === "FAILED").length;
  const remontados = pontos.filter((p) => p.status === "REMOUNTED").length;

  // O resultado declarado pelo script vale; sem ele, deduzimos dos pontos.
  // Assim um script antigo (ou um campo que mudou de nome) ainda produz um
  // veredito utilizável em vez de virar "desconhecido".
  let result = normalizarResultado(getPath(payload, "result"));
  if (result === "UNKNOWN" && pontos.length > 0) {
    result = falhas > 0 ? "FAILED" : remontados > 0 ? "RECOVERED" : "OK";
    avisos.push("Resultado ausente; deduzido a partir dos pontos.");
  }

  return {
    host: lerTexto(getPath(payload, "host")),
    result,
    pontos,
    pointsTotal: pontos.length,
    pointsFailed: falhas,
    remounted: remontados > 0 || lerBooleano(getPath(payload, "remounted")),
    durationSeconds: lerNumero(getPath(payload, "durationSeconds")),
    startedAt: lerData(getPath(payload, "startedAt")),
    bootAt: lerData(getPath(payload, "bootAt")),
    bootRecent: lerBooleano(getPath(payload, "bootRecent")),
    avisos,
  };
}
