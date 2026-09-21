import Link from "next/link";
import type { Role } from "@prisma/client";
import { HIERARQUIA } from "@/lib/auth/roles";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

const ITENS_MOBILE = [
  { href: "/dashboard", label: "Dashboard", minimo: "VIEWER" as Role },
  { href: "/clientes", label: "Clientes", minimo: "VIEWER" as Role },
  { href: "/maquinas", label: "Máquinas", minimo: "VIEWER" as Role },
  { href: "/jobs", label: "Jobs", minimo: "VIEWER" as Role },
  { href: "/alertas", label: "Alertas", minimo: "VIEWER" as Role },
  { href: "/usuarios", label: "Usuários", minimo: "ADMIN" as Role },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const itensMobile = ITENS_MOBILE.filter((i) => HIERARQUIA[user.role] >= HIERARQUIA[i.minimo]);

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-2 md:hidden">
          {itensMobile.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-[var(--color-muted)]"
            >
              {item.label}
            </Link>
          ))}
          <div className="ml-auto shrink-0">
            <ThemeToggle compacto />
          </div>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
