import { prisma } from "@/lib/db/prisma";

export type AuditInput = {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Registrar auditoria nunca pode derrubar a operação auditada.
 * Falha aqui vira log no console, não exceção.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as never,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] falha ao registrar", input.action, e);
  }
}
