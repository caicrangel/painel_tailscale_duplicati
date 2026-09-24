"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { JANELA_FALHAS_NOTIFICACAO_DIAS } from "@/lib/sistema/auditoria";

/**
 * Devolve à fila as notificações que desistiram na janela recente. O worker
 * tenta de novo no próximo ciclo, do zero — útil depois de corrigir o token
 * do Telegram ou o SMTP.
 */
export async function reenviarNotificacoesFalhas(): Promise<
  ActionResult<number>
> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const desde = new Date(
    Date.now() - JANELA_FALHAS_NOTIFICACAO_DIAS * 24 * 60 * 60_000,
  );
  const { count } = await prisma.alertNotification.updateMany({
    where: { status: "FAILED", createdAt: { gte: desde } },
    data: { status: "PENDING", attempts: 0 },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "notificacao.reenvio",
    metadata: { quantidade: count },
  });

  revalidatePath("/configuracoes/sistema");
  return { ok: true, data: count };
}
