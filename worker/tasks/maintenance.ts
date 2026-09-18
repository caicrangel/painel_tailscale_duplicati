import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/config/settings";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Manutenção (de hora em hora): limpa janelas de rate limit vencidas e,
 * se RAW_PAYLOAD_RETENTION_DAYS > 0, expurga o payload bruto antigo.
 * Na Fase 1 o expurgo vem desligado (retenção total).
 */
export async function manutencao(now: Date = new Date()): Promise<number> {
  return registrarCiclo("MAINTENANCE", async () => {
    let itens = await pruneRateLimits();

    const settings = await getSettings();
    if (settings.rawPayloadRetentionDays > 0) {
      const corte = new Date(now.getTime() - settings.rawPayloadRetentionDays * 86_400_000);
      // Só o bruto é apagado; as métricas já parseadas continuam no histórico.
      const { count } = await prisma.backupRun.updateMany({
        where: { receivedAt: { lt: corte }, NOT: { rawPayload: { equals: {} } } },
        data: { rawPayload: {}, parseError: "payload bruto expurgado por política de retenção" },
      });
      itens += count;
    }

    // SyncLogs antigos não servem para nada e crescem rápido (um por minuto).
    const { count: logs } = await prisma.syncLog.deleteMany({
      where: { startedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
    });

    return itens + logs;
  });
}
