import { cn } from "@/lib/utils/cn";

/**
 * Faixa de execuções por dia (últimos N dias), uma célula por dia.
 *
 * Acessibilidade — não negociável aqui: em modo claro, vermelho e âmbar ficam a
 * ΔE 1.5 sob deuteranopia (medido com o validador da skill de dataviz). Portanto
 * a cor NUNCA é o único canal:
 *   • sucesso  → preenchimento sólido
 *   • warning  → listras a 45°
 *   • erro     → sólido com anel
 *   • atrasado → listras a 135°
 *   • sem execução → só contorno
 * Cada célula carrega title (tooltip) e aria-label com a data e o resultado.
 */

export type DiaDaFaixa = {
  data: string; // ISO yyyy-mm-dd
  resultado: "SUCCESS" | "WARNING" | "ERROR" | "FATAL" | "DESCONHECIDO" | "NENHUM";
  execucoes: number;
};

const ROTULO = {
  SUCCESS: "sucesso",
  WARNING: "warning",
  ERROR: "erro",
  FATAL: "falha fatal",
  DESCONHECIDO: "resultado ilegível",
  NENHUM: "sem execução",
} as const;

const COR = {
  SUCCESS: "var(--color-ok)",
  WARNING: "var(--color-warn)",
  ERROR: "var(--color-danger)",
  FATAL: "var(--color-danger)",
  DESCONHECIDO: "var(--color-idle)",
  NENHUM: "transparent",
} as const;

function estiloDaCelula(resultado: DiaDaFaixa["resultado"]): React.CSSProperties {
  const cor = COR[resultado];

  if (resultado === "NENHUM") {
    return { backgroundColor: "transparent", border: "1px dashed var(--color-border)" };
  }

  // "Rodou mas não entendemos o relatório" é diferente de "não rodou" — e a
  // diferença importa: uma é problema de parsing nosso, a outra é backup faltando.
  if (resultado === "DESCONHECIDO") {
    return {
      backgroundColor: "color-mix(in srgb, var(--color-idle) 35%, transparent)",
      border: "1px solid var(--color-idle)",
    };
  }

  if (resultado === "WARNING") {
    return {
      backgroundImage: `repeating-linear-gradient(45deg, ${cor} 0 2px, color-mix(in srgb, ${cor} 35%, transparent) 2px 4px)`,
      border: `1px solid ${cor}`,
    };
  }

  if (resultado === "ERROR" || resultado === "FATAL") {
    return {
      backgroundColor: cor,
      border: "1px solid var(--color-surface)",
      boxShadow: `0 0 0 1.5px ${cor}`,
    };
  }

  return { backgroundColor: cor, border: `1px solid ${cor}` };
}

function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function HeatStrip({ dias, className }: { dias: DiaDaFaixa[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-[2px]", className)} role="img"
      aria-label={`Execuções dos últimos ${dias.length} dias`}>
      {dias.map((dia) => (
        <span
          key={dia.data}
          title={`${formatarDia(dia.data)} — ${ROTULO[dia.resultado]}${
            dia.execucoes > 1 ? ` (${dia.execucoes} execuções)` : ""
          }`}
          aria-label={`${formatarDia(dia.data)}: ${ROTULO[dia.resultado]}`}
          className="h-4 w-2 shrink-0 rounded-[2px]"
          style={estiloDaCelula(dia.resultado)}
        />
      ))}
    </div>
  );
}

/** Legenda obrigatória: a faixa nunca aparece sem ela. */
export function HeatStripLegenda() {
  const itens: DiaDaFaixa["resultado"][] = [
    "SUCCESS",
    "WARNING",
    "ERROR",
    "DESCONHECIDO",
    "NENHUM",
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-muted)]">
      {itens.map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2 rounded-[2px]" style={estiloDaCelula(r)} aria-hidden />
          {ROTULO[r]}
        </span>
      ))}
    </div>
  );
}
