"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/auth-actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  estaAtivo,
  itensDoPapel,
  type ContagemAlertas,
} from "@/components/navegacao";
import { cn } from "@/lib/utils/cn";

/**
 * Navegação do celular: barra superior com a marca e barra inferior com abas.
 *
 * Abas embaixo porque é onde o polegar alcança com o aparelho numa mão só — e
 * porque a faixa horizontal que havia no topo escondia metade dos itens fora
 * da tela, incluindo o "Sair". O que não é uso diário (clientes, usuários,
 * configurações, tema, conta) vai para a gaveta "Mais", que sobe de baixo.
 */
export function MobileNav({
  user,
  alertas,
}: {
  user: { name: string; email: string; role: Role };
  alertas: ContagemAlertas;
}) {
  const pathname = usePathname();
  const [gavetaAberta, setGavetaAberta] = useState(false);

  const itens = itensDoPapel(user.role);
  const abas = itens.filter((i) => i.abaMovel);
  const naGaveta = itens.filter((i) => !i.abaMovel);
  const maisAtivo = naGaveta.some((i) => estaAtivo(pathname, i.href));

  // Trocou de tela (inclusive tocando num item da gaveta): a gaveta fecha.
  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <ShieldCheck className="size-4 text-[var(--color-info)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">Painel</p>
          <p className="truncate text-[11px] leading-tight text-[var(--color-faint)]">
            Infra &amp; Backups
          </p>
        </div>
        <ThemeToggle compacto />
      </header>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${abas.length + 1}, minmax(0, 1fr))` }}>
          {abas.map(({ href, labelCurto, Icone }) => {
            const ativo = estaAtivo(pathname, href);
            const contador = href === "/alertas" ? alertas.abertos : 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={ativo ? "page" : undefined}
                  aria-label={contador > 0 ? `${labelCurto} (${contador} aberto(s))` : undefined}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                    ativo ? "font-medium text-[var(--color-info)]" : "text-[var(--color-muted)]",
                  )}
                >
                  {ativo && (
                    <span
                      className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-[var(--color-info)]"
                      aria-hidden
                    />
                  )}
                  <span className="relative">
                    <Icone className="size-5" aria-hidden />
                    {contador > 0 && (
                      <span
                        className={cn(
                          "absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white tabular-nums",
                          alertas.criticos > 0 ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]",
                        )}
                        aria-hidden
                      >
                        {contador > 99 ? "99+" : contador}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate px-1">{labelCurto}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setGavetaAberta(true)}
              aria-haspopup="dialog"
              aria-expanded={gavetaAberta}
              className={cn(
                "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                maisAtivo ? "font-medium text-[var(--color-info)]" : "text-[var(--color-muted)]",
              )}
            >
              {maisAtivo && (
                <span
                  className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-[var(--color-info)]"
                  aria-hidden
                />
              )}
              <Menu className="size-5" aria-hidden />
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <Gaveta aberta={gavetaAberta} aoFechar={() => setGavetaAberta(false)}>
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 pb-4">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-dim)] text-sm font-semibold text-[var(--color-info)]"
            aria-hidden
          >
            {iniciais(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-[var(--color-faint)]">{user.email}</p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
            {ROLE_LABEL[user.role]}
          </span>
        </div>

        {naGaveta.length > 0 && (
          <ul className="p-2">
            {naGaveta.map(({ href, label, Icone }) => {
              const ativo = estaAtivo(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors active:bg-[var(--color-surface-2)]",
                      ativo ? "bg-[var(--color-surface-2)] font-medium" : "text-[var(--color-fg)]",
                    )}
                  >
                    <Icone className="size-5 shrink-0 text-[var(--color-muted)]" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="size-4 text-[var(--color-faint)]" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">Tema</p>
          <ThemeToggle />
        </div>

        <form action={logoutAction} className="border-t border-[var(--color-border)] p-2">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-[var(--color-danger)] transition-colors active:bg-[var(--color-danger-dim)]"
          >
            <LogOut className="size-5 shrink-0" aria-hidden />
            Sair do painel
          </button>
        </form>
      </Gaveta>
    </>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Gaveta que sobe da borda de baixo, sobre o <dialog> nativo — pelo mesmo
 * motivo do Modal: Esc, foco preso e fundo inerte vêm prontos do navegador.
 */
function Gaveta({
  aberta,
  aoFechar,
  children,
}: {
  aberta: boolean;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberta && !dialog.open) dialog.showModal();
    else if (!aberta && dialog.open) dialog.close();
  }, [aberta]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.addEventListener("close", aoFechar);
    return () => dialog.removeEventListener("close", aoFechar);
  }, [aoFechar]);

  return (
    <dialog
      ref={ref}
      aria-label="Mais opções"
      // Toque no fundo escurecido fecha: o alvo é o próprio <dialog>, não o conteúdo.
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      className="gaveta w-full rounded-t-2xl bg-[var(--color-surface)] p-0 text-[var(--color-fg)] shadow-2xl md:hidden"
    >
      <div className="max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {/* O X mora na faixa da alça, fora da linha do usuário: ali ele cobria o papel. */}
        <div className="relative flex h-11 items-center justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--color-border)]" aria-hidden />
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-muted)] active:bg-[var(--color-surface-2)]"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
