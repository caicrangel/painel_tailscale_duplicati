"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, Mail, SlidersHorizontal, Activity } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ABAS = [
  { href: "/configuracoes/telegram", label: "Telegram", Icone: Send },
  { href: "/configuracoes/email", label: "E-mail (SMTP)", Icone: Mail },
  { href: "/configuracoes/monitoramento", label: "Monitoramento", Icone: SlidersHorizontal },
  { href: "/configuracoes/sistema", label: "Sistema", Icone: Activity },
];

export function ConfigTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      {ABAS.map(({ href, label, Icone }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              ativo
                ? "border-[var(--color-info)] font-medium text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]",
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
