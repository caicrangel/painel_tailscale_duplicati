import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMarca } from "@/components/marca";
import { getAparencia } from "@/lib/config/aparencia";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const a = await getAparencia();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMarca
            marca={{
              nome: a.nome,
              subtitulo: a.subtitulo,
              logos: a.logos,
              mostrarNome: a.mostrarNome,
              tamanhoLogo: a.tamanhoLogoLogin,
            }}
            className={a.logos ? "max-w-full justify-center" : "size-11 rounded-xl"}
            style={a.logos ? { height: a.tamanhoLogoLogin } : undefined}
          />
          <div>
            <h1 className={(a.logos && !a.mostrarNome) || !a.nome ? "sr-only" : "text-lg font-semibold"}>
              {a.nome || "Painel"}
            </h1>
            {a.subtitulo && <p className="mt-1 text-sm text-[var(--color-muted)]">{a.subtitulo}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-faint)]">
          Acesso restrito à equipe. Não há cadastro público.
        </p>

        <div className="mt-4 flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
