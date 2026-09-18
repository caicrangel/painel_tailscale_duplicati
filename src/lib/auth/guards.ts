import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@prisma/client";
import { podeAtuarComo } from "./roles";

export type SessionUser = { id: string; email: string; name: string; role: Role };

/**
 * Regra 3 do CLAUDE.md: o middleware é a primeira camada, não a única.
 * Toda página, Server Action e route handler revalida aqui — e vai ao banco,
 * porque um usuário desativado depois do login ainda carrega um JWT válido.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  if (!user || !user.active) redirect("/login?erro=sessao-invalida");
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requireRole(minimo: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!podeAtuarComo(user.role, minimo)) redirect("/dashboard?erro=sem-permissao");
  return user;
}

/** Versão para Server Actions: devolve erro em vez de redirecionar. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Guard para Server Action: `{ ok: false }` em vez de exception (CLAUDE.md). */
export async function guardAction(minimo: Role): Promise<
  { ok: true; user: SessionUser } | { ok: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!podeAtuarComo(user.role, minimo)) {
    return { ok: false, error: "Você não tem permissão para esta ação." };
  }
  return { ok: true, user };
}
