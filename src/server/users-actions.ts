"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { novaSenhaSchema, primeiroErro, userSchema } from "@/lib/validation/schemas";

export async function criarUsuario(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const parsed = userSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active") !== "false",
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const senha = novaSenhaSchema.safeParse({ password: formData.get("password") });
  if (!senha.success) return { ok: false, error: primeiroErro(senha.error) };

  const forca = validatePasswordStrength(senha.data.password);
  if (!forca.ok) return { ok: false, error: forca.error };

  const existente = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existente) return { ok: false, error: "Já existe um usuário com este e-mail." };

  const user = await prisma.user.create({
    data: { ...parsed.data, passwordHash: await hashPassword(senha.data.password) },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "usuario.criado",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}

export async function atualizarUsuario(id: string, formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const parsed = userSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active") !== "false",
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  // Proteções contra o admin se trancar para fora do próprio sistema.
  if (alvo.id === guard.user.id && parsed.data.role !== "ADMIN") {
    return { ok: false, error: "Você não pode rebaixar o seu próprio usuário." };
  }
  if (alvo.id === guard.user.id && !parsed.data.active) {
    return { ok: false, error: "Você não pode desativar o seu próprio usuário." };
  }
  if (alvo.role === "ADMIN" && (parsed.data.role !== "ADMIN" || !parsed.data.active)) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) {
      return { ok: false, error: "Este é o último administrador ativo. Promova outro antes." };
    }
  }

  await prisma.user.update({ where: { id }, data: parsed.data });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "usuario.atualizado",
    entityType: "User",
    entityId: id,
    metadata: { role: parsed.data.role, active: parsed.data.active },
  });

  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}

export async function redefinirSenha(id: string, formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const senha = novaSenhaSchema.safeParse({ password: formData.get("password") });
  if (!senha.success) return { ok: false, error: primeiroErro(senha.error) };

  const forca = validatePasswordStrength(senha.data.password);
  if (!forca.ok) return { ok: false, error: forca.error };

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(senha.data.password) },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "usuario.senha_redefinida",
    entityType: "User",
    entityId: id,
  });

  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}

export async function removerUsuario(id: string): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  if (id === guard.user.id) return { ok: false, error: "Você não pode remover o seu próprio usuário." };

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  if (alvo.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) return { ok: false, error: "Este é o último administrador ativo." };
  }

  await prisma.user.delete({ where: { id } });
  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "usuario.removido",
    entityType: "User",
    entityId: id,
    metadata: { email: alvo.email },
  });

  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}
