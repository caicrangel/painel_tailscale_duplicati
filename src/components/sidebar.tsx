"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Server,
  HardDriveDownload,
  BellRing,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/auth-actions";
import { HIERARQUIA, ROLE_LABEL } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils/cn";

const ITENS = [
  { href: "/dashboard", label: "Dashboard", Icone: LayoutDashboard, minimo: "VIEWER" as Role },
  { href: "/clientes", label: "Clientes", Icone: Building2, minimo: "VIEWER" as Role },
  { href: "/maquinas", label: "Máquinas", Icone: Server, minimo: "VIEWER" as Role },
  { href: "/jobs", label: "Jobs de backup", Icone: HardDriveDownload, minimo: "VIEWER" as Role },
  { href: "/alertas", label: "Alertas", Icone: BellRing, minimo: "VIEWER" as Role },
  { href: "/usuarios", label: "Usuários", Icone: Users, minimo: "ADMIN" as Role },
  { href: "/configuracoes", label: "Configurações", Icone: Settings, minimo: "ADMIN" as Role },
];

const CHAVE = "painel.menu-recolhido";

export function Sidebar({
  user,
}: {
  user: { name: string; email: string; role: Role };
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

  const itens = ITENS.filter((i) => HIERARQUIA[user.role] >= HIERARQUIA[i.minimo]);

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
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <ShieldCheck className="size-4 text-[var(--color-info)]" />
        </div>
        {!recolhido && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Painel</p>
            <p className="truncate text-[11px] text-[var(--color-faint)]">Infra &amp; Backups</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {itens.map(({ href, label, Icone }) => {
          const ativo = pathname === href || pathname.startsWith(`${href}/`);
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
              <Icone className="size-4 shrink-0" />
              {!recolhido && <span className="truncate">{label}</span>}
              {recolhido && <span className="sr-only">{label}</span>}
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
