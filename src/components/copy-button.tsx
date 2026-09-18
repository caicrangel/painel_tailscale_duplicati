"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Clipboard API exige contexto seguro; em HTTP puro cai no fallback.
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copiado ? "Copiado" : label}
    </Button>
  );
}
