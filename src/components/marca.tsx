import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type DadosMarca = {
  nome: string;
  subtitulo: string;
  logos: { claro: string; escuro: string } | null;
  /** Falso: o logo é um logotipo completo e ocupa o lugar do nome. */
  mostrarNome: boolean;
  /** Altura do logo no menu, em px. */
  tamanhoLogo: number;
  /** Posição do logo (e do nome, quando houver) no cabeçalho do menu. */
  alinhamento?: "esquerda" | "centro" | "direita";
};

const JUSTIFICAR = { esquerda: "justify-start", centro: "justify-center", direita: "justify-end" } as const;

/**
 * Logo do painel. Com logo por tema, as duas imagens vão para a página e o CSS
 * (globals.css) mostra a do tema ativo: trocar o tema troca o logo na hora,
 * sem esperar o servidor, e sem piscar o logo errado no primeiro carregamento.
 * A imagem acompanha a altura do contêiner e mantém a proporção — um logotipo
 * largo não é espremido num quadrado.
 */
export function LogoMarca({
  marca,
  className,
  style,
}: {
  marca: DadosMarca;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!marca.logos) {
    return (
      <div
        className={cn(
          "flex aspect-square shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]",
          className,
        )}
        style={style}
      >
        <ShieldCheck className="size-1/2 text-[var(--color-info)]" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 items-center", className)} style={style}>
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
export function CabecalhoMarca({
  marca,
  compacto = false,
  alturaMaxima,
}: {
  marca: DadosMarca;
  compacto?: boolean;
  /** Teto para onde o espaço é fixo, como a barra do topo no celular. */
  alturaMaxima?: number;
}) {
  // Sem nome e sem subtítulo não há texto para mostrar: o logo ocupa o espaço.
  const semTexto = !marca.nome && !marca.subtitulo;
  const soLogo = marca.logos !== null && (!marca.mostrarNome || semTexto);
  // Leitor de tela sempre recebe um nome, mesmo com o campo em branco.
  const nomeAcessivel = marca.nome || "Painel";

  if (compacto) {
    return (
      <>
        <LogoMarca marca={marca} className="h-8 max-w-10" />
        <span className="sr-only">{nomeAcessivel}</span>
      </>
    );
  }

  // Altura escolhida em Configurações › Aparência. Só o logo: pode usar toda a
  // largura do cabeçalho. Ao lado do nome: até ~2,5× a altura, para o texto caber.
  const altura = marca.logos ? Math.min(marca.tamanhoLogo, alturaMaxima ?? Infinity) : 32;

  const justificar = JUSTIFICAR[marca.alinhamento ?? "esquerda"];

  if (soLogo) {
    return (
      <div className={cn("flex min-w-0 flex-1", justificar)}>
        <LogoMarca marca={marca} className="max-w-full" style={{ height: altura }} />
        <span className="sr-only">{nomeAcessivel}</span>
      </div>
    );
  }

  // Logo + nome andam juntos: o alinhamento move o conjunto.
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", justificar)}>
      <LogoMarca marca={marca} style={{ height: altura, maxWidth: Math.round(altura * 2.5) }} />
      <div className="min-w-0">
        {marca.nome ? (
          <p className="truncate text-sm font-semibold leading-tight">{marca.nome}</p>
        ) : (
          <span className="sr-only">{nomeAcessivel}</span>
        )}
        {marca.subtitulo && (
          <p className="truncate text-[11px] leading-tight text-[var(--color-faint)]">{marca.subtitulo}</p>
        )}
      </div>
    </div>
  );
}
