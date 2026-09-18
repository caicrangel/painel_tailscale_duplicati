"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { atribuirMaquinaSchema, machineSchema, primeiroErro } from "@/lib/validation/schemas";

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
    clientId: formData.get("clientId"),
    hostname: formData.get("hostname"),
    displayName: formData.get("displayName"),
    notes: formData.get("notes"),
    maintenanceUntil: formData.get("maintenanceUntil"),
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  await prisma.machine.update({
    where: { id },
    data: {
      clientId: parsed.data.clientId ?? null,
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
