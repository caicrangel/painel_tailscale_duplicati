import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/config/settings";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Manutenção (de hora em hora): limpa janelas de rate limit vencidas e,
 * se a retenção configurada for > 0, expurga o payload bruto antigo — tanto o
 * dos backups quanto o das verificações de montagem.
 *
 * O bruto existe para corrigir o parser quando ele erra. Passado o prazo ele
 * não serve mais para isso e continua guardando a topologia do cliente (nomes
 * de job, caminhos de share, volumes), então vira só exposição. As métricas já
 * interpretadas ficam no histórico; só o JSON some.
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

      const { count: montagens } = await prisma.mountCheck.updateMany({
        where: { receivedAt: { lt: corte }, NOT: { rawPayload: { equals: {} } } },
        data: { rawPayload: {}, parseError: "payload bruto expurgado por política de retenção" },
      });
      itens += montagens;
    }

    // SyncLogs antigos não servem para nada e crescem rápido (um por minuto).
    const { count: logs } = await prisma.syncLog.deleteMany({
      where: { startedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
    });

    return itens + logs;
  });
}
