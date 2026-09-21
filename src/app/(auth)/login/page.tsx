import { Suspense } from "react";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Entrar · Painel" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <ShieldCheck className="size-5 text-[var(--color-info)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Painel de Monitoramento</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Infraestrutura e backups dos clientes
            </p>
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
