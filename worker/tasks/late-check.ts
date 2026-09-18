import { prisma } from "@/lib/db/prisma";
import { calcularStatusJob } from "@/lib/jobs/late";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Dead man's switch (a cada 5 min).
 *
 * Reavalia TODO job ativo: o que deveria ter rodado e não rodou passa a LATE.
 * É a única forma de enxergar o backup que falha em silêncio — nenhum relatório
 * chega justamente quando o problema existe.
 */
export async function verificarAtrasos(now: Date = new Date()): Promise<number> {
  return registrarCiclo("LATE_CHECK", async () => {
    const jobs = await prisma.backupJob.findMany({
      select: {
        id: true,
        status: true,
        lastRunAt: true,
        lastParsedResult: true,
        expectedIntervalMinutes: true,
        toleranceMinutes: true,
        graceUntil: true,
        paused: true,
        active: true,
        createdAt: true,
        nextExpectedAt: true,
      },
    });

    let alterados = 0;

    for (const job of jobs) {
      const avaliacao = calcularStatusJob({ ...job, now });

      const mudouStatus = avaliacao.status !== job.status;
      const mudouPrevisao =
        avaliacao.nextExpectedAt?.getTime() !== job.nextExpectedAt?.getTime();

      if (!mudouStatus && !mudouPrevisao) continue;

      await prisma.backupJob.update({
        where: { id: job.id },
        data: { status: avaliacao.status, nextExpectedAt: avaliacao.nextExpectedAt },
      });

      if (mudouStatus) {
        alterados += 1;
        if (avaliacao.status === "LATE") {
          console.warn(
            `[late-check] job ${job.id} atrasado em ${avaliacao.lateByMinutes} min`,
          );
        }
      }
    }

    return alterados;
  });
}
