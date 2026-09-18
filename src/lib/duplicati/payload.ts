/**
 * Parsing do relatório do Duplicati.
 *
 * O formato varia por versão, por SO e por configuração do job. A regra aqui
 * é uma só: NADA é obrigatório e nada derruba a ingestão. O payload bruto já
 * foi salvo antes de chegar nesta função (regra 2 do CLAUDE.md); tudo o que
 * este módulo faz é extrair o que der, e reportar o que não deu.
 *
 * Módulo puro: sem Prisma, sem rede, sem Date.now() implícito.
 */

export type ParsedResultado = "SUCCESS" | "WARNING" | "ERROR" | "FATAL" | "UNKNOWN";

export type RelatorioDuplicati = {
  parsedResult: ParsedResultado;
  beginTime: Date | null;
  endTime: Date | null;
  durationSeconds: number | null;

  sizeOfExaminedFiles: bigint | null;
  examinedFiles: bigint | null;
  addedFiles: bigint | null;
  deletedFiles: bigint | null;
  modifiedFiles: bigint | null;
  bytesUploaded: bigint | null;
  bytesDownloaded: bigint | null;
  knownFileSize: bigint | null;

  messagesCount: number;
  warningsCount: number;
  errorsCount: number;

  mainOperation: string | null;
  duplicatiVersion: string | null;

  machineId: string | null;
  machineName: string | null;
  backupId: string | null;
  backupName: string | null;

  /** Anotações do que não pôde ser lido — vai para BackupRun.parseError. */
  avisos: string[];
};

// ─── Leitores seguros ────────────────────────────────────────────────────────

/** Acesso a caminho aninhado que nunca lança. `getPath(p, "Data.ParsedResult")`. */
export function getPath(origem: unknown, caminho: string): unknown {
  let atual: unknown = origem;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

/** Primeiro caminho que devolver algo diferente de undefined/null/"" . */
function primeiro(origem: unknown, caminhos: string[]): unknown {
  for (const c of caminhos) {
    const v = getPath(origem, c);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function lerTexto(valor: unknown): string | null {
  if (typeof valor === "string") {
    const t = valor.trim();
    return t === "" ? null : t;
  }
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return null;
}

/** Números podem vir como string ("1234") ou com separador; nunca lança. */
export function lerNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const limpo = valor.trim().replace(/[^\d.eE+-]/g, "");
    if (limpo === "") return null;
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function lerBigInt(valor: unknown): bigint | null {
  if (typeof valor === "bigint") return valor;
  const n = lerNumero(valor);
  if (n === null) return null;
  // Valores negativos existem no Duplicati (ex.: AssignedQuotaSpace = -1)
  // e não fazem sentido como métrica de tamanho.
  if (n < 0) return null;
  try {
    return BigInt(Math.round(n));
  } catch {
    return null;
  }
}

// ─── Datas ───────────────────────────────────────────────────────────────────

const RE_CULTURA_US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i;
const RE_CULTURA_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * BeginTime/EndTime podem vir em ISO 8601 ou no formato de cultura do .NET
 * ("8/15/2025 3:00:00 AM"), que varia com o locale da máquina do cliente.
 * Tenta ISO, depois cultura en-US, depois pt-BR (dd/MM), e desiste com null.
 */
export function lerData(valor: unknown): Date | null {
  const texto = lerTexto(valor);
  if (!texto) return null;

  // ISO 8601 (inclusive com 7 casas de segundo, que o JS tolera)
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    const d = new Date(texto);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const us = RE_CULTURA_US.exec(texto);
  // Só é en-US (M/d) se o primeiro número puder ser mês; senão cai no dd/MM abaixo.
  if (us && Number(us[1]) >= 1 && Number(us[1]) <= 12) {
    const [, mes, dia, ano, hora, min, seg, meridiano] = us;
    let h = Number(hora);
    if (meridiano) {
      const pm = meridiano.toUpperCase() === "PM";
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const d = new Date(Number(ano), Number(mes) - 1, Number(dia), h, Number(min), Number(seg));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Sem meridiano e com dia > 12 só pode ser dd/MM (pt-BR)
  const br = RE_CULTURA_BR.exec(texto);
  if (br) {
    const [, dia, mes, ano, hora, min, seg] = br;
    if (Number(dia) > 12) {
      const d = new Date(
        Number(ano),
        Number(mes) - 1,
        Number(dia),
        Number(hora),
        Number(min),
        Number(seg ?? 0),
      );
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const fallback = new Date(texto);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

const RE_TIMESPAN = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;

/** "00:05:32.1234567" (TimeSpan do .NET) ou "1.02:00:00" → segundos. */
export function lerDuracao(valor: unknown): number | null {
  const texto = lerTexto(valor);
  if (!texto) return lerNumero(valor);

  const m = RE_TIMESPAN.exec(texto);
  if (m) {
    const [, dias, horas, minutos, segundos, fracao] = m;
    const total =
      Number(dias ?? 0) * 86400 +
      Number(horas) * 3600 +
      Number(minutos) * 60 +
      Number(segundos) +
      (fracao ? Number(`0.${fracao}`) : 0);
    return Math.round(total);
  }

  return lerNumero(texto);
}

// ─── Listas de mensagens ─────────────────────────────────────────────────────

/**
 * Messages/Warnings/Errors podem vir como array, como string única, ou ausentes.
 * O Duplicati também manda *ActualLength, que é a contagem real quando a lista
 * vem truncada — ela tem precedência.
 */
export function contarLista(lista: unknown, actualLength: unknown): number {
  const real = lerNumero(actualLength);
  if (real !== null && real >= 0) return Math.round(real);
  if (Array.isArray(lista)) return lista.length;
  if (typeof lista === "string" && lista.trim() !== "") return 1;
  return 0;
}

export function normalizarLista(lista: unknown): string[] {
  if (Array.isArray(lista)) return lista.map((i) => lerTexto(i) ?? String(i)).filter(Boolean);
  const texto = lerTexto(lista);
  return texto ? [texto] : [];
}

// ─── ParsedResult ────────────────────────────────────────────────────────────

/** Case-insensitive; valor desconhecido vira UNKNOWN, nunca erro. */
export function normalizarResultado(valor: unknown): ParsedResultado {
  const texto = lerTexto(valor)?.toUpperCase();
  switch (texto) {
    case "SUCCESS":
      return "SUCCESS";
    case "WARNING":
      return "WARNING";
    case "ERROR":
      return "ERROR";
    case "FATAL":
      return "FATAL";
    default:
      return "UNKNOWN";
  }
}

// ─── Parser principal ────────────────────────────────────────────────────────

export function parseRelatorioDuplicati(payload: unknown): RelatorioDuplicati {
  const avisos: string[] = [];

  if (payload === null || typeof payload !== "object") {
    return {
      ...vazio(),
      avisos: ["Payload não é um objeto JSON."],
    };
  }

  const parsedResult = normalizarResultado(
    primeiro(payload, ["Data.ParsedResult", "ParsedResult", "Data.BackendStatistics.ParsedResult"]),
  );
  if (parsedResult === "UNKNOWN") avisos.push("ParsedResult ausente ou desconhecido.");

  const beginTime = lerData(primeiro(payload, ["Data.BeginTime", "BeginTime"]));
  const endTime = lerData(primeiro(payload, ["Data.EndTime", "EndTime"]));
  if (!beginTime) avisos.push("BeginTime ausente ou em formato não reconhecido.");
  if (!endTime) avisos.push("EndTime ausente ou em formato não reconhecido.");

  let durationSeconds = lerDuracao(primeiro(payload, ["Data.Duration", "Duration"]));
  if (durationSeconds === null && beginTime && endTime) {
    // Duração ausente: deriva do intervalo, se as duas pontas existirem.
    const delta = Math.round((endTime.getTime() - beginTime.getTime()) / 1000);
    durationSeconds = delta >= 0 ? delta : null;
  }

  return {
    parsedResult,
    beginTime,
    endTime,
    durationSeconds,

    sizeOfExaminedFiles: lerBigInt(getPath(payload, "Data.SizeOfExaminedFiles")),
    examinedFiles: lerBigInt(getPath(payload, "Data.ExaminedFiles")),
    addedFiles: lerBigInt(getPath(payload, "Data.AddedFiles")),
    deletedFiles: lerBigInt(getPath(payload, "Data.DeletedFiles")),
    modifiedFiles: lerBigInt(getPath(payload, "Data.ModifiedFiles")),
    bytesUploaded: lerBigInt(getPath(payload, "Data.BackendStatistics.BytesUploaded")),
    bytesDownloaded: lerBigInt(getPath(payload, "Data.BackendStatistics.BytesDownloaded")),
    knownFileSize: lerBigInt(getPath(payload, "Data.BackendStatistics.KnownFileSize")),

    messagesCount: contarLista(
      getPath(payload, "Data.Messages"),
      getPath(payload, "Data.MessagesActualLength"),
    ),
    warningsCount: contarLista(
      getPath(payload, "Data.Warnings"),
      getPath(payload, "Data.WarningsActualLength"),
    ),
    errorsCount: contarLista(
      getPath(payload, "Data.Errors"),
      getPath(payload, "Data.ErrorsActualLength"),
    ),

    mainOperation: lerTexto(primeiro(payload, ["Data.MainOperation", "Extra.OperationName"])),
    duplicatiVersion: lerTexto(primeiro(payload, ["Data.Version", "Version"])),

    machineId: lerTexto(primeiro(payload, ["Extra.machine-id", "Extra.MachineId", "Extra.machineid"])),
    machineName: lerTexto(
      primeiro(payload, ["Extra.machine-name", "Extra.MachineName", "Extra.machinename"]),
    ),
    backupId: lerTexto(primeiro(payload, ["Extra.backup-id", "Extra.BackupId", "Extra.backupid"])),
    backupName: lerTexto(
      primeiro(payload, ["Extra.backup-name", "Extra.BackupName", "Extra.backupname"]),
    ),

    avisos,
  };
}

function vazio(): RelatorioDuplicati {
  return {
    parsedResult: "UNKNOWN",
    beginTime: null,
    endTime: null,
    durationSeconds: null,
    sizeOfExaminedFiles: null,
    examinedFiles: null,
    addedFiles: null,
    deletedFiles: null,
    modifiedFiles: null,
    bytesUploaded: null,
    bytesDownloaded: null,
    knownFileSize: null,
    messagesCount: 0,
    warningsCount: 0,
    errorsCount: 0,
    mainOperation: null,
    duplicatiVersion: null,
    machineId: null,
    machineName: null,
    backupId: null,
    backupName: null,
    avisos: [],
  };
}
