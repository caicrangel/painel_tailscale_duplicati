import type { NextAuthConfig } from "next-auth";

/**
 * Configuração compartilhada e segura para o Edge (middleware).
 * NÃO importa Prisma nem argon2 aqui: módulos nativos não rodam no Edge runtime.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: "painel.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // Rodamos HTTP puro dentro da tailnet; ligue AUTH_COOKIE_SECURE com HTTPS.
        secure: process.env.AUTH_COOKIE_SECURE === "true",
      },
    },
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "VIEWER";
        token.name = user.name ?? null;
        token.email = user.email ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = (token.role as string) ?? "VIEWER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
