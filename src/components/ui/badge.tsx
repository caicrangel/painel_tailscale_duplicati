import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type Tone = "ok" | "warn" | "danger" | "late" | "info" | "idle" | "neutral";

const TONES: Record<Tone, string> = {
  ok: "bg-[var(--color-ok-dim)] text-[var(--color-ok)] border-[var(--color-ok)]/30",
  warn: "bg-[var(--color-warn-dim)] text-[var(--color-warn)] border-[var(--color-warn)]/30",
  danger: "bg-[var(--color-danger-dim)] text-[var(--color-danger)] border-[var(--color-danger)]/30",
  late: "bg-[var(--color-late-dim)] text-[var(--color-late)] border-[var(--color-late)]/30",
  info: "bg-[var(--color-info-dim)] text-[var(--color-info)] border-[var(--color-info)]/30",
  idle: "bg-[var(--color-idle-dim)] text-[var(--color-idle)] border-[var(--color-idle)]/30",
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot = false,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
