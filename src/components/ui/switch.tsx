import { cn } from "@/lib/utils/cn";

/**
 * Checkbox com rótulo e explicação. Checkbox nativo de propósito: funciona com
 * FormData, com teclado e com leitor de tela sem nenhum JavaScript nosso.
 */
export function SwitchField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer rounded border-[var(--color-border)]",
          "accent-[var(--color-info)]",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm text-[var(--color-fg)]">{label}</span>
        {hint && <span className="block text-xs text-[var(--color-muted)]">{hint}</span>}
      </span>
    </label>
  );
}
