import type { Role } from "@prisma/client";

/**
 * Hierarquia de papéis — lógica pura, sem next-auth nem Prisma runtime,
 * para poder ser testada isoladamente (regra 5 do CLAUDE.md).
 *   ADMIN    → tudo, inclusive usuários e tokens de ingestão
 *   OPERATOR → CRUD de clientes/máquinas/jobs e reconhecer alertas
 *   VIEWER   → somente leitura, sem ver token de ingestão
 */
export const HIERARQUIA: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export function podeAtuarComo(role: Role, minimo: Role): boolean {
  return HIERARQUIA[role] >= HIERARQUIA[minimo];
}

/** VIEWER nunca recebe o token de ingestão — filtrado no servidor. */
export function podeVerTokenDeIngestao(role: Role): boolean {
  return podeAtuarComo(role, "OPERATOR");
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Visualizador",
};
