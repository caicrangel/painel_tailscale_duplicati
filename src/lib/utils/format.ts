const TZ = "America/Sao_Paulo";

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const horaCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDataHora(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return dataHora.format(date);
}

export function fmtDataHoraCurta(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return horaCurta.format(date);
}

/** "há 3 min", "em 2 h" — sempre relativo a `now` (injetável para teste). */
export function fmtRelativo(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "nunca";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - now.getTime();
  const futuro = diffMs > 0;
  const abs = Math.abs(diffMs);

  const min = Math.round(abs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return futuro ? `em ${min} min` : `há ${min} min`;

  const horas = Math.round(min / 60);
  if (horas < 24) return futuro ? `em ${horas} h` : `há ${horas} h`;

  const dias = Math.round(horas / 24);
  if (dias < 30) return futuro ? `em ${dias} d` : `há ${dias} d`;

  const meses = Math.round(dias / 30);
  return futuro ? `em ${meses} mês(es)` : `há ${meses} mês(es)`;
}

/** Duração legível a partir de segundos: "1h 12min", "45s". */
export function fmtDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min < 60) return resto ? `${min}min ${resto}s` : `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

const UNIDADES = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function fmtBytes(bytes: number | bigint | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  let n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return "—";
  let i = 0;
  while (n >= 1024 && i < UNIDADES.length - 1) {
    n /= 1024;
    i += 1;
  }
  const casas = i === 0 ? 0 : n < 10 ? 2 : 1;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${UNIDADES[i]}`;
}

export function fmtNumero(n: number | bigint | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("pt-BR");
}

/** Intervalo em minutos → "a cada 24h", "a cada 30min". */
export function fmtIntervalo(minutos: number): string {
  if (minutos % 1440 === 0) {
    const dias = minutos / 1440;
    return dias === 1 ? "diário" : `a cada ${dias} dias`;
  }
  if (minutos % 60 === 0) return `a cada ${minutos / 60}h`;
  return `a cada ${minutos}min`;
}
