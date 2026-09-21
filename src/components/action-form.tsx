"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Resultado = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Formulário que chama uma Server Action que devolve ActionResult.
 * Erro de domínio vira mensagem na tela — não exception (CLAUDE.md).
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  pendingLabel = "Salvando…",
  successMessage,
  className,
  extraActions,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<Resultado>;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  successMessage?: string;
  className?: string;
  extraActions?: React.ReactNode;
  /** Chamado depois de uma execução bem-sucedida (ex.: fechar o diálogo). */
  onSuccess?: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setErro(null);
        setSucesso(null);
        startTransition(async () => {
          const res = await action(formData);
          if (!res.ok) {
            setErro(res.error);
            return;
          }
          setSucesso(successMessage ?? "Alterações salvas.");
          router.refresh();
          onSuccess?.();
        });
      }}
    >
      {children}

      {erro && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="mt-4 rounded-md border border-[var(--color-ok)]/30 bg-[var(--color-ok-dim)] px-3 py-2 text-sm text-[var(--color-ok)]">
          {sucesso}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}

/** Botão para ação destrutiva/pontual, com confirmação. */
export function ActionButton({
  action,
  label,
  pendingLabel = "Processando…",
  confirmar,
  variant = "secondary",
  size = "md",
  onDone,
}: {
  action: () => Promise<Resultado>;
  label: string;
  pendingLabel?: string;
  confirmar?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  onDone?: (data: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          setErro(null);
          startTransition(async () => {
            const res = await action();
            if (!res.ok) {
              setErro(res.error);
              return;
            }
            onDone?.(res.data);
            router.refresh();
          });
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      {erro && <span className="text-xs text-[var(--color-danger)]">{erro}</span>}
    </span>
  );
}
