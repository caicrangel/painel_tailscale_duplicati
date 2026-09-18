import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { Tone } from "@/components/ui/badge";

const ACENTO: Record<Tone, string> = {
  ok: "text-[var(--color-ok)]",
  warn: "text-[var(--color-warn)]",
  danger: "text-[var(--color-danger)]",
  late: "text-[var(--color-late)]",
  info: "text-[var(--color-info)]",
  idle: "text-[var(--color-idle)]",
  neutral: "text-[var(--color-fg)]",
};

const BARRA: Record<Tone, string> = {
  ok: "bg-[var(--color-ok)]",
  warn: "bg-[var(--color-warn)]",
  danger: "bg-[var(--color-danger)]",
  late: "bg-[var(--color-late)]",
  info: "bg-[var(--color-info)]",
  idle: "bg-[var(--color-idle)]",
  neutral: "bg-[var(--color-border)]",
};

/**
 * Stat tile: um número que já é a resposta. Não vira gráfico de uma barra.
 * O ícone + rótulo acompanham a cor — status nunca é comunicado só por cor.
 */
export function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
  icon,
  href,
  destaque = false,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  hint?: string;
  icon?: React.ReactNode;
  href?: string;
  destaque?: boolean;
}) {
  const conteudo = (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-xl border bg-[var(--color-surface)] p-4 transition-colors",
        destaque && Number(value) > 0
          ? "border-[var(--color-border-strong)]"
          : "border-[var(--color-border)]",
        href && "hover:border-[var(--color-muted)]",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", BARRA[tone])} aria-hidden />
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
        {icon && <span className={ACENTO[tone]}>{icon}</span>}
        {label}
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums tracking-tight", ACENTO[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--color-faint)]">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

/** Número-herói: a única métrica que o dashboard lidera. */
export function HeroNumber({
  value,
  label,
  tone = "neutral",
  sub,
}: {
  value: string | number;
  label: string;
  tone?: Tone;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className={cn("mt-1 text-5xl font-semibold tabular-nums tracking-tight", ACENTO[tone])}>
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}
