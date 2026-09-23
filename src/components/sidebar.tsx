"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/auth-actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { estaAtivo, itensDoPapel, type ContagemAlertas } from "@/components/navegacao";
import { CabecalhoMarca, type DadosMarca } from "@/components/marca";
import { cn } from "@/lib/utils/cn";

const CHAVE = "painel.menu-recolhido";

export function Sidebar({
  user,
  alertas,
  marca,
}: {
  user: { name: string; email: string; role: Role };
  alertas: ContagemAlertas;
  marca: DadosMarca;
}) {
  const pathname = usePathname();
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE) === "1");
    } catch {
      // storage bloqueado: fica expandido
    }
  }, []);

  function alternar() {
    setRecolhido((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE, novo ? "1" : "0");
      } catch {
        // idem
      }
      return novo;
    });
  }

  const itens = itensDoPapel(user.role);

  return (
    <aside
      className={cn(
        // sticky + h-screen: o rodapé (tema, usuário, recolher) precisa estar
        // sempre alcançável, sem rolar a página inteira até o fim.
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 md:flex",
        recolhido ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-[var(--color-border)] px-3 py-4",
          recolhido && "justify-center px-0",
        )}
      >
        <CabecalhoMarca marca={marca} compacto={recolhido} />
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {itens.map(({ href, label, Icone }) => {
          const ativo = estaAtivo(pathname, href);
          const contador = href === "/alertas" ? alertas.abertos : 0;
          const corContador =
            alertas.criticos > 0 ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]";
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              // Recolhido, o title é o que diz ao usuário para onde o ícone leva.
              title={recolhido ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors",
                recolhido ? "justify-center px-0" : "px-3",
                ativo
                  ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-fg)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]/60 hover:text-[var(--color-fg)]",
              )}
            >
              <span className="relative shrink-0">
                <Icone className="size-4" />
                {recolhido && contador > 0 && (
                  <span
                    className={cn("absolute -right-1 -top-1 size-2 rounded-full", corContador)}
                    aria-hidden
                  />
                )}
              </span>
              {!recolhido && <span className="flex-1 truncate">{label}</span>}
              {!recolhido && contador > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums",
                    corContador,
                  )}
                >
                  {contador}
                </span>
              )}
              {recolhido && (
                <span className="sr-only">
                  {label}
                  {contador > 0 && ` (${contador} aberto(s))`}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-2">
        <div className={cn("mb-2", recolhido ? "flex justify-center" : "px-1")}>
          <ThemeToggle compacto={recolhido} rotulos={false} />
        </div>

        {!recolhido && (
          <div className="mb-2 px-1">
            <p className="truncate text-xs font-medium text-[var(--color-fg)]">{user.name}</p>
            <p className="truncate text-[11px] text-[var(--color-faint)]">{user.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              {ROLE_LABEL[user.role]}
            </p>
          </div>
        )}

        <form action={logoutAction}>
          <button
            type="submit"
            title={recolhido ? `Sair (${user.email})` : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-md py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
              recolhido ? "justify-center px-0" : "px-3",
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {!recolhido && "Sair"}
            {recolhido && <span className="sr-only">Sair</span>}
          </button>
        </form>

        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-md py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
            recolhido ? "justify-center px-0" : "px-3",
          )}
        >
          {recolhido ? (
            <PanelLeftOpen className="size-4 shrink-0" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" />
          )}
          {!recolhido && "Recolher menu"}
          {recolhido && <span className="sr-only">Expandir menu</span>}
        </button>
      </div>
    </aside>
  );
}
