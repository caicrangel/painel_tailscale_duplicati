/**
 * BigInt não sobrevive à serialização RSC → cliente. Converte para number
 * (os valores são bytes/contagens de arquivo; Number.MAX_SAFE_INTEGER = 9 PB,
 * folgado para o caso de uso) preservando null/undefined.
 */
export function bigIntToNumber(value: bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/** Converte recursivamente todo BigInt de um objeto em number. */
export function serializeBigInts<T>(value: T): T {
  if (typeof value === "bigint") return Number(value) as unknown as T;
  if (Array.isArray(value)) return value.map(serializeBigInts) as unknown as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeBigInts(v);
    return out as T;
  }
  return value;
}
