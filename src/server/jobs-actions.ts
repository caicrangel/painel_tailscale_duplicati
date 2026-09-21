"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { backupJobSchema, primeiroErro } from "@/lib/validation/schemas";
import { calcularStatusJob } from "@/lib/jobs/late";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function atualizarJob(id: string, formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const parsed = backupJobSchema.safeParse({
    name: formData.get("name"),
    expectedIntervalMinutes: formData.get("expectedIntervalMinutes"),
    toleranceMinutes: formData.get("toleranceMinutes"),
    destinationHint: formData.get("destinationHint"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    paused: formData.get("paused") === "on" || formData.get("paused") === "true",
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const job = await prisma.backupJob.findUnique({
    where: { id },
    include: { machine: { select: { status: true, maintenanceUntil: true } } },
  });
  if (!job) return { ok: false, error: "Job não encontrado." };

  // Mudar intervalo/tolerância muda o veredito de atraso: recalcula na hora,
  // sem esperar o próximo ciclo do worker.
  const avaliacao = calcularStatusJob({
    lastRunAt: job.lastRunAt,
    lastParsedResult: job.lastParsedResult,
    expectedIntervalMinutes: parsed.data.expectedIntervalMinutes,
    toleranceMinutes: parsed.data.toleranceMinutes,
    graceUntil: job.graceUntil,
    paused: parsed.data.paused,
    active: parsed.data.active,
    createdAt: job.createdAt,
    now: new Date(),
  });

  await prisma.backupJob.update({
    where: { id },
    data: {
      name: parsed.data.name,
      expectedIntervalMinutes: parsed.data.expectedIntervalMinutes,
      toleranceMinutes: parsed.data.toleranceMinutes,
      destinationHint: parsed.data.destinationHint ?? null,
      active: parsed.data.active,
      paused: parsed.data.paused,
      status: avaliacao.status,
      nextExpectedAt: avaliacao.nextExpectedAt,
    },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "job.atualizado",
    entityType: "BackupJob",
    entityId: id,
    metadata: {
      expectedIntervalMinutes: parsed.data.expectedIntervalMinutes,
      toleranceMinutes: parsed.data.toleranceMinutes,
      paused: parsed.data.paused,
    },
    ip: await ip(),
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { ok: true, data: undefined };
}

/**
 * Remove um job e todo o histórico dele (execuções e alertas caem por cascade).
 *
 * Atenção operacional: se o job ainda existir no Duplicati daquela máquina, o
 * próximo relatório recria o registro aqui do zero — inclusive a frequência
 * esperada volta ao padrão. Remover só faz sentido para job que também deixou
 * de existir na origem.
 */
export async function removerJob(id: string): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const job = await prisma.backupJob.findUnique({
    where: { id },
    include: { _count: { select: { runs: true } }, machine: { select: { hostname: true } } },
  });
  if (!job) return { ok: false, error: "Job não encontrado." };

  await prisma.backupJob.delete({ where: { id } });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "job.removido",
    entityType: "BackupJob",
    entityId: id,
    metadata: {
      name: job.name,
      machine: job.machine.hostname,
      duplicatiBackupId: job.duplicatiBackupId,
      execucoesApagadas: job._count.runs,
    },
  });

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/jobs");
}
