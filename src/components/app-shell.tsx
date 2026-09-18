import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  Server,
  HardDriveDownload,
  BellRing,
  Users,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { NavLink } from "./nav-link";
import { HIERARQUIA, ROLE_LABEL } from "@/lib/auth/roles";

const ITENS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minimo: "VIEWER" as Role },
  { href: "/clientes", label: "Clientes", icon: Building2, minimo: "VIEWER" as Role },
  { href: "/maquinas", label: "Máquinas", icon: Server, minimo: "VIEWER" as Role },
  { href: "/jobs", label: "Jobs de backup", icon: HardDriveDownload, minimo: "VIEWER" as Role },
  { href: "/alertas", label: "Alertas", icon: BellRing, minimo: "VIEWER" as Role },
  { href: "/usuarios", label: "Usuários", icon: Users, minimo: "ADMIN" as Role },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const itens = ITENS.filter((i) => HIERARQUIA[user.role] >= HIERARQUIA[i.minimo]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <ShieldCheck className="size-4 text-[var(--color-info)]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Painel</p>
            <p className="truncate text-[11px] text-[var(--color-faint)]">Infra &amp; Backups</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {itens.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label}>
              <item.icon className="size-4" />
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-xs font-medium text-[var(--color-fg)]">{user.name}</p>
            <p className="truncate text-[11px] text-[var(--color-faint)]">{user.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              {ROLE_LABEL[user.role]}
            </p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="size-4" />
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-2 md:hidden">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-[var(--color-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
