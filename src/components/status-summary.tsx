import { Badge, type Tone } from "@/components/ui/badge";

/**
 * Resumo de estados em linha: "2 online · 1 offline".
 *
 * Cada contagem vem com a palavra do estado, sempre. Um número colorido sozinho
 * embaixo de um cabeçalho genérico não diz o que é — e em modo claro vermelho e
 * âmbar ficam a ΔE 1.5 sob deuteranopia, então a cor sozinha não distingue nem
 * para quem olha com atenção.
 *
 * Estados zerados não aparecem: a linha mostra o que existe, não um inventário
 * de tudo o que poderia existir.
 */

export type ItemStatus = { valor: number; label: string; tone: Tone };

export function StatusSummary({
  itens,
  vazio = "—",
}: {
  itens: ItemStatus[];
  vazio?: string;
}) {
  const comValor = itens.filter((i) => i.valor > 0);

  if (comValor.length === 0) {
    return <span className="text-xs text-[var(--color-faint)]">{vazio}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {comValor.map((item) => (
        <Badge key={item.label} tone={item.tone} dot>
          {item.valor} {item.label}
        </Badge>
      ))}
    </div>
  );
}
