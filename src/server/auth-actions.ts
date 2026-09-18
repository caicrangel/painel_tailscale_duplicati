"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/config/env";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

export type LoginState = { error?: string } | undefined;

async function contexto() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "desconhecido";
  return { ip, userAgent: h.get("user-agent") };
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { email, password } = parsed.data;
  const { ip, userAgent } = await contexto();
  const e = env();

  const limite = await consumeRateLimit({
    bucket: "login",
    identifier: `${email}|${ip}`,
    limit: e.LOGIN_RATE_LIMIT_ATTEMPTS,
    windowMinutes: e.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  });

  if (!limite.allowed) {
    await audit({
      userEmail: email,
      action: "auth.login_bloqueado_rate_limit",
      ip,
      userAgent,
      metadata: { tentativas: limite.count },
    });
    const min = Math.ceil(limite.retryAfterSeconds / 60);
    return { error: `Muitas tentativas. Tente novamente em ${min} minuto(s).` };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      await audit({ userEmail: email, action: "auth.login_falhou", ip, userAgent });
      return { error: "E-mail ou senha incorretos." };
    }
    throw error;
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  await clearRateLimit("login", `${email}|${ip}`);
  await audit({ userId: user?.id, userEmail: email, action: "auth.login", ip, userAgent });

  // Fora do try/catch: redirect() sinaliza por exceção e não pode ser capturado acima.
  const destino = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/dashboard";
  redirect(destino);
}

export async function logoutAction() {
  const { ip, userAgent } = await contexto();
  await audit({ action: "auth.logout", ip, userAgent });
  await signOut({ redirectTo: "/login" });
}
