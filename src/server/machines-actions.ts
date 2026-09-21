"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { atribuirMaquinaSchema, machineSchema, primeiroErro } from "@/lib/validation/schemas";
import { normalizarHostname } from "@/lib/duplicati/match";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Vincula (ou desvincula) uma máquina a um cliente. É o fluxo do "não atribuído". */
export async function atribuirMaquina(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const parsed = atribuirMaquinaSchema.safeParse({
    machineId: formData.get("machineId"),
    clientId: formData.get("clientId"),
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const { machineId, clientId } = parsed.data;

  if (clientId) {
    const cliente = await prisma.client.findUnique({ where: { id: clientId } });
    if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  }

  const maquina = await prisma.machine.update({
    where: { id: machineId },
    data: { clientId },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: clientId ? "maquina.vinculada" : "maquina.desvinculada",
    entityType: "Machine",
    entityId: machineId,
    metadata: { hostname: maquina.hostname, clientId },
    ip: await ip(),
  });

  revalidatePath("/maquinas");
  revalidatePath(`/maquinas/${machineId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: undefined };
}

export async function atualizarMaquina(id: string, formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const parsed = machineSchema.safeParse({
    role: formData.get("role") ?? "CLIENTE",
    clientId: formData.get("clientId"),
    hostname: formData.get("hostname"),
    displayName: formData.get("displayName"),
    notes: formData.get("notes"),
    maintenanceUntil: formData.get("maintenanceUntil"),
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  // Máquina de suporte atende todos os clientes por definição, então não fica
  // presa a um: manter um vínculo aqui só criaria contradição na tela.
  const suporte = parsed.data.role === "SUPORTE";

  await prisma.machine.update({
    where: { id },
    data: {
      role: parsed.data.role,
      clientId: suporte ? null : (parsed.data.clientId ?? null),
      hostname: parsed.data.hostname,
      displayName: parsed.data.displayName ?? null,
      notes: parsed.data.notes ?? null,
      maintenanceUntil: parsed.data.maintenanceUntil ?? null,
    },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "maquina.atualizada",
    metadata: { role: parsed.data.role },
    entityType: "Machine",
    entityId: id,
    ip: await ip(),
  });

  revalidatePath("/maquinas");
  revalidatePath(`/maquinas/${id}`);
  return { ok: true, data: undefined };
}

/**
 * Remove uma máquina. Se ela veio do Tailscale, o próximo sync a recria —
 * por isso o aviso é explícito na UI e a remoção só faz sentido para
 * máquinas órfãs criadas pela ingestão.
 */
export async function removerMaquina(id: string): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const maquina = await prisma.machine.findUnique({ where: { id } });
  if (!maquina) return { ok: false, error: "Máquina não encontrada." };

  await prisma.machine.delete({ where: { id } });
  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "maquina.removida",
    entityType: "Machine",
    entityId: id,
    metadata: { hostname: maquina.hostname, source: maquina.source },
    ip: await ip(),
  });

  revalidatePath("/maquinas");
  return { ok: true, data: undefined };
}

/**
 * Mescla uma máquina criada pela ingestão do Duplicati com o device
 * correspondente do Tailscale.
 *
 * Por que isto existe: o hostname do Tailscale e o `machine-name` que o
 * Duplicati reporta divergem com frequência (um device
 * "cliente-saolucas.tailnet.ts.net" pode se apresentar como "srv-betania"), e
 * aí o mesmo servidor aparece duas vezes — uma com status de rede e sem jobs,
 * outra com os jobs e sem status.
 *
 * A mesclagem move os jobs para o device do Tailscale e registra o nome usado
 * pelo Duplicati como apelido. Esse apelido é o que impede a duplicata de
 * voltar no próximo backup.
 */
export async function mesclarMaquinas(
  origemId: string,
  destinoId: string,
): Promise<ActionResult> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  if (origemId === destinoId) return { ok: false, error: "Escolha duas máquinas diferentes." };

  const [origem, destino] = await Promise.all([
    prisma.machine.findUnique({
      where: { id: origemId },
      include: { backupJobs: { select: { id: true, duplicatiBackupId: true } } },
    }),
    prisma.machine.findUnique({
      where: { id: destinoId },
      include: { backupJobs: { select: { id: true, duplicatiBackupId: true } } },
    }),
  ]);

  if (!origem || !destino) return { ok: false, error: "Máquina não encontrada." };

  if (destino.tailscaleDeviceId === null) {
    return {
      ok: false,
      error: "A máquina de destino precisa ser um device do Tailscale.",
    };
  }

  // Apelidos: tudo pelo qual a origem era conhecida passa a valer no destino.
  // `?? []` de propósito: um client do Prisma desatualizado (schema novo, app
  // ainda não reiniciado) devolve o campo como undefined, e a mesclagem não
  // pode explodir por causa disso.
  const apelidos = new Set(destino.duplicatiHostnames ?? []);
  for (const nome of [origem.hostname, origem.displayName, ...(origem.duplicatiHostnames ?? [])]) {
    const normalizado = normalizarHostname(nome);
    if (normalizado && normalizado !== normalizarHostname(destino.hostname)) {
      apelidos.add(normalizado);
    }
  }

  const jobsDoDestino = new Map(destino.backupJobs.map((j) => [j.duplicatiBackupId, j.id]));

  await prisma.$transaction(async (tx) => {
    for (const job of origem.backupJobs) {
      const colide = jobsDoDestino.get(job.duplicatiBackupId);
      if (colide) {
        // O destino já tem um job com a mesma chave do Duplicati: preserva o
        // histórico juntando as execuções e descarta o registro duplicado.
        await tx.backupRun.updateMany({
          where: { backupJobId: job.id },
          data: { backupJobId: colide },
        });
        await tx.alert.updateMany({
          where: { backupJobId: job.id },
          data: { backupJobId: colide },
        });
        await tx.backupJob.delete({ where: { id: job.id } });
      } else {
        await tx.backupJob.update({ where: { id: job.id }, data: { machineId: destinoId } });
      }
    }

    await tx.alert.updateMany({ where: { machineId: origemId }, data: { machineId: destinoId } });

    await tx.machine.update({
      where: { id: destinoId },
      data: {
        duplicatiHostnames: [...apelidos],
        duplicatiMachineId: destino.duplicatiMachineId ?? origem.duplicatiMachineId,
        clientId: destino.clientId ?? origem.clientId,
        notes: destino.notes ?? origem.notes,
      },
    });

    await tx.machine.delete({ where: { id: origemId } });
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "maquina.mesclada",
    entityType: "Machine",
    entityId: destinoId,
    metadata: {
      origem: origem.hostname,
      destino: destino.hostname,
      jobsMovidos: origem.backupJobs.length,
      apelidos: [...apelidos],
    },
    ip: await ip(),
  });

  revalidatePath("/maquinas");
  revalidatePath(`/maquinas/${destinoId}`);
  revalidatePath("/dashboard");
  redirect(`/maquinas/${destinoId}`);
}
