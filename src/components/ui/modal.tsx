"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Diálogo centralizado sobre o elemento <dialog> nativo.
 *
 * Nativo de propósito: Esc para fechar, foco preso dentro do diálogo, fundo
 * inerte e camada acima de tudo vêm do navegador, prontos e acessíveis. Uma
 * div com position:fixed exigiria reimplementar tudo isso à mão — e a versão
 * feita à mão quase sempre esquece o foco.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  largura = "md",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  largura?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (aberto && !dialog.open) dialog.showModal();
    else if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  // Esc dispara "cancel"/"close" no próprio elemento: avisa o pai para o estado
  // não ficar dessincronizado do que está na tela.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const aoFecharNativo = () => aoFechar();
    dialog.addEventListener("close", aoFecharNativo);
    return () => dialog.removeEventListener("close", aoFecharNativo);
  }, [aoFechar]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-titulo"
      // Clique no fundo fecha; clique no conteúdo não (o alvo é o próprio dialog
      // só quando o clique cai fora do card).
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className={cn(
        "w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-fg)] shadow-2xl backdrop:bg-black/50",
        largura === "sm" && "max-w-md",
        largura === "md" && "max-w-2xl",
        largura === "lg" && "max-w-4xl",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h2 id="modal-titulo" className="text-sm font-semibold">
            {titulo}
          </h2>
          {descricao && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{descricao}</p>}
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
    </dialog>
  );
}
