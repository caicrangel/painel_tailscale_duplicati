import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type DadosMarca = {
  nome: string;
  subtitulo: string;
  logos: { claro: string; escuro: string } | null;
  /** Falso: o logo é um logotipo completo e ocupa o lugar do nome. */
  mostrarNome: boolean;
};

/**
 * Logo do painel. Com logo por tema, as duas imagens vão para a página e o CSS
 * (globals.css) mostra a do tema ativo: trocar o tema troca o logo na hora,
 * sem esperar o servidor, e sem piscar o logo errado no primeiro carregamento.
 * A imagem acompanha a altura do contêiner e mantém a proporção — um logotipo
 * largo não é espremido num quadrado.
 */
export function LogoMarca({ marca, className }: { marca: DadosMarca; className?: string }) {
  if (!marca.logos) {
    return (
      <div
        className={cn(
          "flex aspect-square shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]",
          className,
        )}
      >
        <ShieldCheck className="size-1/2 text-[var(--color-info)]" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rota própria, já com cache eterno; o otimizador do Next não agrega */}
      <img src={marca.logos.escuro} alt="" className="logo-tema-escuro h-full w-auto max-w-full object-contain object-left" />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img src={marca.logos.claro} alt="" className="logo-tema-claro h-full w-auto max-w-full object-contain object-left" />
    </div>
  );
}

/**
 * Cabeçalho de marca do menu (lateral e celular): logo + nome, ou só o
 * logotipo quando o administrador desligou o nome.
 */
export function CabecalhoMarca({ marca, compacto = false }: { marca: DadosMarca; compacto?: boolean }) {
  const soLogo = marca.logos !== null && !marca.mostrarNome;

  if (compacto) {
    return (
      <>
        <LogoMarca marca={marca} className="h-8 max-w-10" />
        <span className="sr-only">{marca.nome}</span>
      </>
    );
  }

  if (soLogo) {
    return (
      <div className="min-w-0 flex-1">
        <LogoMarca marca={marca} className="h-9 max-w-[11rem]" />
        <span className="sr-only">{marca.nome}</span>
      </div>
    );
  }

  return (
    <>
      <LogoMarca marca={marca} className="h-8 max-w-[4.5rem]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{marca.nome}</p>
        {marca.subtitulo && (
          <p className="truncate text-[11px] leading-tight text-[var(--color-faint)]">{marca.subtitulo}</p>
        )}
      </div>
    </>
  );
}
