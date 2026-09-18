"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

/** Log do payload bruto: é o que permite corrigir o parser quando ele erra. */
export function PayloadViewer({ payload }: { payload: unknown }) {
  const [aberto, setAberto] = useState(false);
  const texto = JSON.stringify(payload, null, 2);

  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Payload bruto recebido ({(texto.length / 1024).toFixed(1)} KB)
        </button>
        {aberto && <CopyButton value={texto} label="Copiar JSON" />}
      </div>
      {aberto && (
        <pre className="max-h-96 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
          {texto}
        </pre>
      )}
    </div>
  );
}
