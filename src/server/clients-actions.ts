"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { guardAction, type ActionResult } from "@/lib/auth/guards";
import { clientSchema, primeiroErro, slugify } from "@/lib/validation/schemas";
import { gerarTokenIngestao } from "@/lib/tokens";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Slug único: acrescenta sufixo numérico enquanto colidir. */
async function slugUnico(base: string, ignorarId?: string): Promise<string> {
  const raiz = slugify(base) || "cliente";
  let candidato = raiz;
  let n = 1;
  for (;;) {
    const existente = await prisma.client.findUnique({ where: { slug: candidato } });
    if (!existente || existente.id === ignorarId) return candidato;
    n += 1;
    candidato = `${raiz}-${n}`;
  }
}

export async function criarCliente(formData: FormData): Promise<ActionResult<never>> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    plan: formData.get("plan"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    telegramChatId: formData.get("telegramChatId"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const cliente = await prisma.client.create({
    data: {
      ...parsed.data,
      slug: await slugUnico(parsed.data.name),
      // Todo cliente nasce com um token de ingestão pronto para usar.
      ingestTokens: { create: { token: gerarTokenIngestao(), label: "padrão" } },
    },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "cliente.criado",
    entityType: "Client",
    entityId: cliente.id,
    metadata: { name: cliente.name },
    ip: await ip(),
  });

  revalidatePath("/clientes");
  // Fora de try/catch: redirect() sinaliza por exceção.
  redirect(`/clientes/${cliente.id}`);
}

export async function atualizarCliente(
  id: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const guard = await guardAction("OPERATOR");
  if (!guard.ok) return guard;

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    plan: formData.get("plan"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    telegramChatId: formData.get("telegramChatId"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error) };

  const atual = await prisma.client.findUnique({ where: { id } });
  if (!atual) return { ok: false, error: "Cliente não encontrado." };

  await prisma.client.update({
    data: {
      ...parsed.data,
      slug: atual.name === parsed.data.name ? atual.slug : await slugUnico(parsed.data.name, id),
    },
    where: { id },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "cliente.atualizado",
    entityType: "Client",
    entityId: id,
    ip: await ip(),
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return { ok: true, data: { id } };
}

export async function removerCliente(id: string): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: { _count: { select: { machines: true } } },
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (cliente._count.machines > 0) {
    return {
      ok: false,
      error: `O cliente ainda tem ${cliente._count.machines} máquina(s) vinculada(s). Desvincule antes de remover.`,
    };
  }

  await prisma.client.delete({ where: { id } });
  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "cliente.removido",
    entityType: "Client",
    entityId: id,
    metadata: { name: cliente.name },
    ip: await ip(),
  });

  revalidatePath("/clientes");
  return { ok: true, data: undefined };
}

export async function rotacionarToken(clientId: string): Promise<ActionResult<{ token: string }>> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const token = gerarTokenIngestao();
  await prisma.ingestToken.create({ data: { clientId, token, label: "rotacionado" } });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "cliente.token_rotacionado",
    entityType: "Client",
    entityId: clientId,
    ip: await ip(),
  });

  // Nota: o token antigo continua válido de propósito, para as máquinas do
  // cliente serem reconfiguradas sem janela de relatórios perdidos.
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: { token } };
}

export async function revogarToken(tokenId: string): Promise<ActionResult> {
  const guard = await guardAction("ADMIN");
  if (!guard.ok) return guard;

  const token = await prisma.ingestToken.findUnique({ where: { id: tokenId } });
  if (!token) return { ok: false, error: "Token não encontrado." };

  const ativos = await prisma.ingestToken.count({
    where: { clientId: token.clientId, active: true, revokedAt: null },
  });
  if (ativos <= 1) {
    return {
      ok: false,
      error: "Este é o último token ativo do cliente. Gere um novo antes de revogar.",
    };
  }

  await prisma.ingestToken.update({
    where: { id: tokenId },
    data: { active: false, revokedAt: new Date() },
  });

  await audit({
    userId: guard.user.id,
    userEmail: guard.user.email,
    action: "cliente.token_revogado",
    entityType: "IngestToken",
    entityId: tokenId,
    ip: await ip(),
  });

  revalidatePath(`/clientes/${token.clientId}`);
  return { ok: true, data: undefined };
}
