"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";

/**
 * Reconhecer um alerta NÃO o fecha: o incidente continua aberto até a condição
 * se resolver sozinha. Reconhecer só registra que alguém já está olhando.
 */
export async function reconhecerAlerta(id: string): Promise<ActionResult> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const alerta = await prisma.alert.findUnique({ where: { id } });
  if (!alerta) return { ok: false, error: "Alerta não encontrado." };
  if (alerta.closedAt) return { ok: false, error: "Este alerta já foi fechado." };

  await prisma.alert.update({
    where: { id },
    data: { acknowledgedAt: new Date(), acknowledgedById: guard.user.id },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "alerta.reconhecido",
    entityType: "Alert",
    entityId: id,
  });

  revalidatePath("/alertas");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
