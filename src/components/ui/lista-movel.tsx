import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Lista em cartões para o celular, no lugar de uma tabela.
 *
 * Tabela de cinco colunas em 390px esconde justamente as colunas da direita —
 * status e última execução, o dado que se abre a tela para ver. Aqui cada
 * linha vira um bloco: identificação à esquerda, status à direita, detalhes
 * embaixo. Some a partir de `md`, onde a tabela volta.
 */
export function ListaMovel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("divide-y divide-[var(--color-border)]/60 md:hidden", className)}>{children}</ul>;
}

export function ItemMovel({
  href,
  titulo,
  subtitulo,
  lateral,
  children,
}: {
  /** Com href, o bloco inteiro é tocável — não coloque outro link dentro. */
  href?: string;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  lateral?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const corpo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium [overflow-wrap:anywhere]">{titulo}</div>
          {subtitulo && (
            <div className="mt-0.5 text-xs text-[var(--color-faint)] [overflow-wrap:anywhere]">
              {subtitulo}
            </div>
          )}
        </div>
        {lateral && <div className="flex shrink-0 flex-col items-end gap-1">{lateral}</div>}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="block px-4 py-3 transition-colors active:bg-[var(--color-surface-2)]"
        >
          {corpo}
        </Link>
      ) : (
        <div className="px-4 py-3">{corpo}</div>
      )}
    </li>
  );
}

/** Pares rótulo/valor em grade de duas colunas, embaixo do cabeçalho do item. */
export function DetalhesMovel({ itens }: { itens: { rotulo: string; valor: React.ReactNode; destaque?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0">
          <dt className="text-[11px] text-[var(--color-faint)]">{i.rotulo}</dt>
          <dd className={cn("truncate text-xs text-[var(--color-muted)]", i.destaque)}>{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Nome de máquina com a parte que distingue em destaque. O hostname da tailnet
 * repete o mesmo domínio em todas ("…tail3a6628.ts.net"); o que o olho procura
 * é o primeiro rótulo. O resto fica esmaecido e pode quebrar no ponto.
 */
export function NomeMaquina({ nome }: { nome: string }) {
  const ponto = nome.indexOf(".");
  if (ponto <= 0) return <>{nome}</>;
  return (
    <>
      {nome.slice(0, ponto)}
      <wbr />
      <span className="font-normal text-[var(--color-faint)]">{nome.slice(ponto)}</span>
    </>
  );
}

/** Mostra a tabela só a partir de `md`; no celular quem aparece é a ListaMovel. */
export function SomenteDesktop({ children }: { children: React.ReactNode }) {
  return <div className="hidden md:block">{children}</div>;
}
