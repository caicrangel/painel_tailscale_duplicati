import { prisma } from "@/lib/db/prisma";

/**
 * Rate limit em Postgres (decisão de arquitetura: sem Redis na Fase 1).
 * Janela fixa por minuto/bloco: agrupa as tentativas em `windowStart` e conta.
 * O unique (bucket, identifier, windowStart) faz o upsert ser atômico mesmo
 * com requests concorrentes.
 */

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

export function windowStartFor(now: Date, windowMinutes: number): Date {
  const ms = windowMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export async function consumeRateLimit(params: {
  bucket: string;
  identifier: string;
  limit: number;
  windowMinutes: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const now = params.now ?? new Date();
  const windowStart = windowStartFor(now, params.windowMinutes);
  const windowEnd = new Date(windowStart.getTime() + params.windowMinutes * 60_000);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));

  try {
    const row = await prisma.rateLimitHit.upsert({
      where: {
        bucket_identifier_windowStart: {
          bucket: params.bucket,
          identifier: params.identifier,
          windowStart,
        },
      },
      create: { bucket: params.bucket, identifier: params.identifier, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    return {
      allowed: row.count <= params.limit,
      count: row.count,
      limit: params.limit,
      retryAfterSeconds,
    };
  } catch {
    // Banco indisponível não pode bloquear a ingestão de relatórios de backup:
    // perder um relatório é pior que aceitar um request a mais.
    return { allowed: true, count: 0, limit: params.limit, retryAfterSeconds };
  }
}

/** Zera o contador (ex.: login bem-sucedido). */
export async function clearRateLimit(bucket: string, identifier: string): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { bucket, identifier } });
}

/** Limpeza das janelas antigas — chamada pelo cron de manutenção. */
export async function pruneRateLimits(olderThanMinutes = 120): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const { count } = await prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
}
