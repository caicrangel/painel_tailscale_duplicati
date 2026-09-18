/** Script de verificação manual do dead man's switch. Não faz parte do produto. */
import { prisma } from "@/lib/db/prisma";
import { verificarAtrasos } from "../worker/tasks/late-check";
import { avaliarAlertas } from "../worker/tasks/alerts";

const job = await prisma.backupJob.findFirst({ orderBy: { createdAt: "asc" } });
if (!job) throw new Error("nenhum job");

// 5 dias sem backup, sem carência
await prisma.backupJob.update({
  where: { id: job.id },
  data: { lastRunAt: new Date(Date.now() - 5 * 86400_000), graceUntil: null, lastParsedResult: "SUCCESS" },
});

console.log("late-check:", await verificarAtrasos());
console.log("status:", (await prisma.backupJob.findUnique({ where: { id: job.id } }))!.status);

console.log("alertas (1ª rodada):", await avaliarAlertas());
console.log("alertas (2ª rodada):", await avaliarAlertas());
console.log("alertas (3ª rodada):", await avaliarAlertas());

const abertos = await prisma.alert.findMany({ where: { closedAt: null } });
console.log("abertos:", abertos.length, abertos.map((a) => a.title));

// o job volta a reportar
await prisma.backupJob.update({ where: { id: job.id }, data: { lastRunAt: new Date() } });
console.log("late-check pós-retorno:", await verificarAtrasos());
console.log("alertas pós-retorno:", await avaliarAlertas());
console.log(
  "abertos agora:",
  await prisma.alert.count({ where: { closedAt: null } }),
  "| fechados:",
  await prisma.alert.count({ where: { closedAt: { not: null } } }),
);
console.log(
  "notificações:",
  (await prisma.alertNotification.findMany({ select: { kind: true, status: true, lastError: true } })),
);
await prisma.$disconnect();
