"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";

export type FiltroOpcao = { value: string; label: string };

/**
 * Filtros por query string: o estado vive na URL, então a página continua
 * sendo Server Component e o filtro é compartilhável/favoritável.
 */
export function FilterBar({
  filtros,
}: {
  filtros: { name: string; label: string; opcoes: FiltroOpcao[]; valor: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function aplicar(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "") next.delete(name);
    else next.set(name, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {filtros.map((f) => (
        // No celular os filtros dividem a linha em vez de empilhar um por linha.
        <div key={f.name} className="min-w-0 flex-1 basis-36 sm:min-w-44 sm:flex-none sm:basis-auto">
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">
            {f.label}
          </label>
          <Select value={f.valor} onChange={(e) => aplicar(f.name, e.target.value)}>
            {f.opcoes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}
