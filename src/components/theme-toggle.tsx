"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Preferencia = "system" | "light" | "dark";

const OPCOES: { valor: Preferencia; label: string; Icone: typeof Sun }[] = [
  { valor: "light", label: "Claro", Icone: Sun },
  { valor: "dark", label: "Escuro", Icone: Moon },
  { valor: "system", label: "Sistema", Icone: Monitor },
];

const CHAVE = "painel.tema";

function aplicar(pref: Preferencia) {
  const escuro =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
}

export function ThemeToggle({
  compacto = false,
  rotulos = true,
}: {
  /** Um único botão que cicla entre as três opções (menu recolhido, mobile). */
  compacto?: boolean;
  /** Mostra o texto ao lado do ícone. Desligue onde a largura é apertada. */
  rotulos?: boolean;
}) {
  // Começa em "system" e só corrige depois de montar: o valor real vive no
  // localStorage, que o servidor não conhece.
  const [pref, setPref] = useState<Preferencia>("system");
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    // Sem escolha própria, vale o tema padrão definido em Configurações › Aparência.
    const padrao = (document.documentElement.dataset.temaPadrao as Preferencia | undefined) ?? "system";
    let salvo: Preferencia = padrao;
    try {
      salvo = (localStorage.getItem(CHAVE) as Preferencia | null) ?? padrao;
    } catch {
      // storage bloqueado: fica o padrão
    }
    setPref(salvo);
    setMontado(true);
  }, []);

  // Em "sistema", acompanha a troca no SO sem precisar recarregar a página.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicar("system");
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [pref]);

  function escolher(valor: Preferencia) {
    setPref(valor);
    try {
      localStorage.setItem(CHAVE, valor);
    } catch {
      // Navegador com storage bloqueado: o tema vale só para esta navegação.
    }
    aplicar(valor);
  }

  if (compacto) {
    const atual = OPCOES.find((o) => o.valor === pref) ?? OPCOES[2]!;
    const proximo = OPCOES[(OPCOES.indexOf(atual) + 1) % OPCOES.length]!;
    return (
      <button
        type="button"
        onClick={() => escolher(proximo.valor)}
        title={`Tema: ${atual.label} — clique para ${proximo.label.toLowerCase()}`}
        aria-label={`Tema: ${atual.label}. Clique para mudar para ${proximo.label}`}
        className="flex size-9 items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
      >
        <atual.Icone className="size-4" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5"
    >
      {OPCOES.map(({ valor, label, Icone }) => {
        const ativo = montado && pref === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            title={label}
            onClick={() => escolher(valor)}
            aria-label={label}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs transition-colors",
              rotulos ? "px-2" : "px-0",
              ativo
                ? "bg-[var(--color-surface)] font-medium text-[var(--color-fg)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            <Icone className="size-3.5 shrink-0" />
            {rotulos ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
