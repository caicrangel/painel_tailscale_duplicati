"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, Mail, SlidersHorizontal, Activity, Palette } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ABAS = [
  { href: "/configuracoes/telegram", label: "Telegram", Icone: Send },
  { href: "/configuracoes/email", label: "E-mail (SMTP)", Icone: Mail },
  { href: "/configuracoes/monitoramento", label: "Monitoramento", Icone: SlidersHorizontal },
  { href: "/configuracoes/aparencia", label: "Aparência", Icone: Palette },
  { href: "/configuracoes/sistema", label: "Sistema", Icone: Activity },
];

export function ConfigTabs() {
  const pathname = usePathname();

  return (
    // No celular as quatro abas não cabem numa linha — viram um seletor 2×2,
    // todas visíveis. A partir de sm voltam a ser abas sublinhadas.
    <nav
      className={cn(
        "grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1",
        "sm:flex sm:overflow-x-auto sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0",
      )}
    >
      {ABAS.map(({ href, label, Icone }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              // Cinco abas em grade de duas: a última ocupa a linha inteira.
              "flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-sm transition-colors last:col-span-2 sm:last:col-span-1",
              "sm:justify-start sm:rounded-none sm:border-b-2 sm:px-3 sm:py-2.5",
              ativo
                ? "bg-[var(--color-surface)] font-medium text-[var(--color-fg)] shadow-sm sm:border-[var(--color-info)] sm:bg-transparent sm:shadow-none"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)] sm:border-transparent",
            )}
          >
            <Icone className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
