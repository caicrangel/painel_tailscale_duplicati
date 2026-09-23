"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Monitor, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { salvarAparencia } from "@/server/settings-actions";
import { derivarPaleta, hexValido } from "@/lib/aparencia/paleta";
import { TAMANHO_MAXIMO_LOGO } from "@/lib/aparencia/logo";

// Espelho de TAMANHO_LOGO (lib/config/aparencia, que só roda no servidor).
// O servidor revalida os limites; aqui é só o alcance do controle.
const LIMITES = {
  menu: { min: 24, max: 72, padrao: 36 },
  login: { min: 40, max: 200, padrao: 64 },
} as const;
import { cn } from "@/lib/utils/cn";

type Tema = "system" | "light" | "dark";
type Variante = "claro" | "escuro";
type Alinhamento = "esquerda" | "centro" | "direita";
const JUSTIFICAR = { esquerda: "justify-start", centro: "justify-center", direita: "justify-end" } as const;

/** Azul original do painel: é o que vale quando nenhuma cor é escolhida. */
const COR_ORIGINAL = "#0969da";

const SUGESTOES = [
  { nome: "Azul", hex: "#0969da" },
  { nome: "Verde", hex: "#1a7f37" },
  { nome: "Petróleo", hex: "#0e7490" },
  { nome: "Roxo", hex: "#7c3aed" },
  { nome: "Laranja", hex: "#c2410c" },
  { nome: "Vermelho", hex: "#be123c" },
  { nome: "Grafite", hex: "#374151" },
];

/**
 * Superfícies e textos fixos de cada tema, para a pré-visualização mostrar os
 * dois lado a lado independentemente do tema em que a tela está aberta.
 */
const TEMA = {
  claro: { bg: "#f6f8fa", surface: "#ffffff", surface2: "#f0f3f6", border: "#d8dee4", fg: "#1f2328", muted: "#59636e" },
  escuro: { bg: "#0b0f14", surface: "#121820", surface2: "#1a222c", border: "#253040", fg: "#e6edf3", muted: "#8ba0b5" },
} as const;

export function AparenciaForm(props: {
  nome: string;
  subtitulo: string;
  corDestaque: string | null;
  temaPadrao: Tema;
  mostrarNome: boolean;
  tamanhoLogoMenu: number;
  tamanhoLogoLogin: number;
  alinhamentoLogo: Alinhamento;
  logos: { claro: string | null; escuro: string | null };
}) {
  const [nome, setNome] = useState(props.nome);
  const [subtitulo, setSubtitulo] = useState(props.subtitulo);
  const [usarPadrao, setUsarPadrao] = useState(props.corDestaque === null);
  const [cor, setCor] = useState(props.corDestaque ?? COR_ORIGINAL);
  const [hexDigitado, setHexDigitado] = useState(props.corDestaque ?? COR_ORIGINAL);
  const [tema, setTema] = useState<Tema>(props.temaPadrao);
  const [mostrarNome, setMostrarNome] = useState(props.mostrarNome);
  const [tamanhoMenu, setTamanhoMenu] = useState(props.tamanhoLogoMenu);
  const [tamanhoLogin, setTamanhoLogin] = useState(props.tamanhoLogoLogin);
  const [alinhamento, setAlinhamento] = useState<Alinhamento>(props.alinhamentoLogo);
  const [logos, setLogos] = useState(props.logos);
  const [removidos, setRemovidos] = useState<Record<Variante, boolean>>({ claro: false, escuro: false });

  // Depois de salvar, o servidor devolve o estado novo: a tela passa a refleti-lo.
  useEffect(() => {
    setLogos(props.logos);
    setRemovidos({ claro: false, escuro: false });
  }, [props.logos]);

  const paleta = useMemo(
    () =>
      usarPadrao
        ? { claro: { destaque: "#0969da", fundo: "#0969da14" }, escuro: { destaque: "#58a6ff", fundo: "#58a6ff22" } }
        : derivarPaleta(cor),
    [usarPadrao, cor],
  );

  // Só um logo enviado vale para os dois temas — mesma regra do servidor.
  const logoDoTema = (v: Variante) => logos[v] ?? logos[v === "claro" ? "escuro" : "claro"];
  const corAjustada = !usarPadrao && (paleta.claro.destaque !== cor || paleta.escuro.destaque !== cor);

  return (
    <ActionForm action={salvarAparencia} successMessage="Aparência salva. Já vale para todos os usuários.">
      <div className="grid items-start gap-6 xl:grid-cols-5">
        <div className="min-w-0 space-y-6 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Identidade</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do painel" hint="Aparece no menu, no login e na aba do navegador. Pode ficar vazio.">
                <Input name="nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
              </Field>
              <Field label="Subtítulo" hint="Linha menor embaixo do nome. Pode ficar vazio.">
                <Input name="subtitulo" value={subtitulo} maxLength={60} onChange={(e) => setSubtitulo(e.target.value)} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logos</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Um logo para cada tema, para ele nunca sumir no fundo. Se enviar só um, ele vale para
                os dois. PNG, JPG, WEBP ou SVG até {TAMANHO_MAXIMO_LOGO / 1024} KB; prefira fundo
                transparente.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="mostrarNome"
                  checked={mostrarNome}
                  onChange={(e) => setMostrarNome(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-info)]"
                />
                <span>
                  Mostrar o nome ao lado do logo
                  <span className="block text-xs text-[var(--color-faint)]">
                    Desligue se o logo já traz o nome escrito: ele passa a ocupar o cabeçalho do
                    menu inteiro, em vez de um quadrado pequeno.
                  </span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <ControleTamanho
                  nome="tamanhoLogoMenu"
                  rotulo="Tamanho no menu"
                  valor={tamanhoMenu}
                  limites={LIMITES.menu}
                  aoMudar={setTamanhoMenu}
                  dica="No celular a barra do topo limita o logo a 44px."
                />
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-xs font-medium text-[var(--color-muted)]">Posição no menu</p>
                  <div role="radiogroup" aria-label="Posição do logo no menu" className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
                    {(
                      [
                        { valor: "esquerda", label: "Esquerda", Icone: AlignLeft },
                        { valor: "centro", label: "Centro", Icone: AlignCenter },
                        { valor: "direita", label: "Direita", Icone: AlignRight },
                      ] as const
                    ).map(({ valor, label, Icone }) => (
                      <button
                        key={valor}
                        type="button"
                        role="radio"
                        aria-checked={alinhamento === valor}
                        onClick={() => setAlinhamento(valor)}
                        className={cn(
                          "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors",
                          alinhamento === valor
                            ? "bg-[var(--color-surface)] font-medium text-[var(--color-fg)] shadow-sm"
                            : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                        )}
                      >
                        <Icone className="size-3.5" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="alinhamentoLogo" value={alinhamento} />
                </div>
                <ControleTamanho
                  nome="tamanhoLogoLogin"
                  rotulo="Tamanho na tela de login"
                  valor={tamanhoLogin}
                  limites={LIMITES.login}
                  aoMudar={setTamanhoLogin}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["claro", "escuro"] as const).map((v) => (
                  <SlotLogo
                    key={v}
                    variante={v}
                    atual={logos[v]}
                    herdado={logos[v] ? null : logoDoTema(v)}
                    removido={removidos[v]}
                    aoEscolher={(url) => {
                      setLogos((l) => ({ ...l, [v]: url }));
                      setRemovidos((r) => ({ ...r, [v]: false }));
                    }}
                    aoRemover={() => {
                      setLogos((l) => ({ ...l, [v]: null }));
                      setRemovidos((r) => ({ ...r, [v]: true }));
                    }}
                  />
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cor de destaque</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Botões, links, item ativo do menu e foco. As cores de status (verde, amarelo,
                vermelho) não mudam: elas carregam significado.
              </p>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="usarCorPadrao"
                  checked={usarPadrao}
                  onChange={(e) => setUsarPadrao(e.target.checked)}
                  className="size-4 accent-[var(--color-info)]"
                />
                Usar o azul original do painel
              </label>

              <fieldset disabled={usarPadrao} className="space-y-4 disabled:opacity-50">
                <div className="flex flex-wrap gap-2">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      title={s.nome}
                      aria-label={`Cor ${s.nome}`}
                      aria-pressed={cor === s.hex}
                      onClick={() => {
                        setCor(s.hex);
                        setHexDigitado(s.hex);
                      }}
                      className={cn(
                        "size-8 rounded-full border-2 transition-transform active:scale-95",
                        cor === s.hex ? "border-[var(--color-fg)]" : "border-transparent",
                      )}
                      style={{ backgroundColor: s.hex }}
                    />
                  ))}
                </div>

                <div className="flex items-end gap-3">
                  <Field label="Personalizada">
                    <input
                      type="color"
                      value={cor}
                      onChange={(e) => {
                        setCor(e.target.value);
                        setHexDigitado(e.target.value);
                      }}
                      className="h-10 w-14 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-1"
                      aria-label="Escolher cor"
                    />
                  </Field>
                  <div className="w-32">
                    <Input
                      value={hexDigitado}
                      maxLength={7}
                      aria-label="Cor em hexadecimal"
                      onChange={(e) => {
                        const v = e.target.value.trim().toLowerCase();
                        setHexDigitado(v);
                        if (hexValido(v)) setCor(v);
                      }}
                      className={cn(!hexValido(hexDigitado) && "border-[var(--color-danger)]")}
                    />
                  </div>
                </div>
                <input type="hidden" name="corDestaque" value={cor} />

                {corAjustada && (
                  <p className="text-xs text-[var(--color-faint)]">
                    Para continuar legível, a cor é ajustada levemente em cada tema:{" "}
                    <Amostra cor={paleta.claro.destaque} /> no claro e{" "}
                    <Amostra cor={paleta.escuro.destaque} /> no escuro.
                  </p>
                )}
              </fieldset>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tema padrão</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-sm text-[var(--color-muted)]">
                Vale para quem ainda não escolheu um tema no próprio navegador. Quem já escolheu
                continua com a sua escolha.
              </p>
              <div role="radiogroup" aria-label="Tema padrão" className="grid grid-cols-3 gap-2">
                {(
                  [
                    { valor: "system", label: "Sistema", Icone: Monitor },
                    { valor: "light", label: "Claro", Icone: Sun },
                    { valor: "dark", label: "Escuro", Icone: Moon },
                  ] as const
                ).map(({ valor, label, Icone }) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={tema === valor}
                    onClick={() => setTema(valor)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm transition-colors",
                      tema === valor
                        ? "border-[var(--color-info)] bg-[var(--color-info-dim)] font-medium"
                        : "border-[var(--color-border)] text-[var(--color-muted)]",
                    )}
                  >
                    <Icone className="size-5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="temaPadrao" value={tema} />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {(["claro", "escuro"] as const).map((v) => (
                <Previa
                  key={v}
                  variante={v}
                  nome={nome}
                  subtitulo={subtitulo}
                  logo={logoDoTema(v)}
                  mostrarNome={mostrarNome}
                  tamanho={tamanhoMenu}
                  alinhamento={alinhamento}
                  destaque={paleta[v].destaque}
                  fundo={paleta[v].fundo}
                />
              ))}
              <PreviaLogin
                logo={logoDoTema("claro")}
                nome={nome}
                subtitulo={subtitulo}
                mostrarNome={mostrarNome}
                tamanho={tamanhoLogin}
                destaque={paleta.claro.destaque}
              />
              <p className="text-xs text-[var(--color-faint)]">
                Só muda para todos depois de salvar.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </ActionForm>
  );
}

function Amostra({ cor }: { cor: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <span className="inline-block size-3 rounded-sm align-middle" style={{ backgroundColor: cor }} />
      {cor}
    </span>
  );
}

function SlotLogo({
  variante,
  atual,
  herdado,
  removido,
  aoEscolher,
  aoRemover,
}: {
  variante: Variante;
  atual: string | null;
  herdado: string | null;
  removido: boolean;
  aoEscolher: (url: string) => void;
  aoRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const t = TEMA[variante];
  const sufixo = variante === "claro" ? "Claro" : "Escuro";
  const mostrado = atual ?? herdado;

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
        {variante === "claro" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        Tema {variante}
      </p>

      {/* O fundo é o do tema, não o desta tela: é onde o logo vai aparecer. */}
      <div
        className="flex h-24 items-center justify-center rounded-md border"
        style={{ backgroundColor: t.surface, borderColor: t.border }}
      >
        {mostrado ? (
          // eslint-disable-next-line @next/next/no-img-element -- pré-visualização de arquivo local (blob:)
          <img src={mostrado} alt={`Logo do tema ${variante}`} className={cn("max-h-16 max-w-[80%] object-contain", !atual && "opacity-60")} />
        ) : (
          <ShieldCheck className="size-8" style={{ color: t.muted }} aria-hidden />
        )}
      </div>
      <p className="mt-1.5 min-h-4 text-[11px] text-[var(--color-faint)]">
        {atual ? "" : herdado ? "Usando o logo do outro tema." : removido ? "Será removido ao salvar." : "Sem logo: usa o ícone padrão."}
      </p>

      <input
        ref={input}
        type="file"
        name={`logo${sufixo}`}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) aoEscolher(URL.createObjectURL(arquivo));
        }}
      />
      <input type="hidden" name={`removerLogo${sufixo}`} value={removido ? "true" : "false"} />

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
          <ImagePlus className="size-3.5" />
          {atual ? "Trocar" : "Enviar"}
        </Button>
        {atual && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (input.current) input.current.value = "";
              aoRemover();
            }}
          >
            <Trash2 className="size-3.5" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}

/** Miniatura do menu e de um botão, com as cores reais de cada tema. */
function Previa({
  variante,
  nome,
  subtitulo,
  logo,
  mostrarNome,
  tamanho,
  alinhamento,
  destaque,
  fundo,
}: {
  variante: Variante;
  nome: string;
  subtitulo: string;
  logo: string | null;
  mostrarNome: boolean;
  tamanho: number;
  alinhamento: Alinhamento;
  destaque: string;
  fundo: string;
}) {
  const t = TEMA[variante];
  return (
    <div className="overflow-hidden rounded-lg border" style={{ backgroundColor: t.bg, borderColor: t.border, color: t.fg }}>
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5" style={{ backgroundColor: t.surface, borderColor: t.border }}>
        <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", JUSTIFICAR[alinhamento])}>
        {logo ? (
          // Mesmas medidas do menu de verdade (CabecalhoMarca).
          <div
            className="flex shrink-0 items-center"
            style={{ height: tamanho, maxWidth: mostrarNome ? Math.round(tamanho * 2.5) : "100%" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização */}
            <img src={logo} alt="" className="h-full w-auto max-w-full object-contain object-left" />
          </div>
        ) : (
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: t.surface2, border: `1px solid ${t.border}` }}
          >
            <ShieldCheck className="size-4" style={{ color: destaque }} />
          </div>
        )}
        {(mostrarNome || !logo) && (nome || subtitulo) && (
          <div className="min-w-0">
            {nome && <p className="truncate text-sm font-semibold">{nome}</p>}
            {subtitulo && <p className="truncate text-[11px]" style={{ color: t.muted }}>{subtitulo}</p>}
          </div>
        )}
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide" style={{ color: t.muted }}>
          {variante}
        </span>
      </div>
      <div className="flex items-center gap-3 p-3">
        <span className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: fundo, color: destaque }}>
          Dashboard
        </span>
        <span className="text-xs underline" style={{ color: destaque }}>
          ver job
        </span>
        <span className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: destaque }}>
          Salvar
        </span>
      </div>
    </div>
  );
}

function ControleTamanho({
  nome,
  rotulo,
  valor,
  limites,
  aoMudar,
  dica,
}: {
  nome: string;
  rotulo: string;
  valor: number;
  limites: { min: number; max: number; padrao: number };
  aoMudar: (v: number) => void;
  dica?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={nome} className="text-xs font-medium text-[var(--color-muted)]">
          {rotulo}
        </label>
        <span className="flex items-center gap-2 text-xs tabular-nums text-[var(--color-muted)]">
          {valor}px
          {valor !== limites.padrao && (
            <button
              type="button"
              onClick={() => aoMudar(limites.padrao)}
              className="text-[var(--color-info)] hover:underline"
            >
              padrão
            </button>
          )}
        </span>
      </div>
      <input
        id={nome}
        name={nome}
        type="range"
        min={limites.min}
        max={limites.max}
        step={2}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="w-full accent-[var(--color-info)]"
      />
      {dica && <p className="mt-1 text-[11px] text-[var(--color-faint)]">{dica}</p>}
    </div>
  );
}

/** Topo da tela de login no tamanho real, para calibrar o controle. */
function PreviaLogin({
  logo,
  nome,
  subtitulo,
  mostrarNome,
  tamanho,
  destaque,
}: {
  logo: string | null;
  nome: string;
  subtitulo: string;
  mostrarNome: boolean;
  tamanho: number;
  destaque: string;
}) {
  const t = TEMA.claro;
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border px-4 py-5 text-center"
      style={{ backgroundColor: t.bg, borderColor: t.border, color: t.fg }}
    >
      <span className="self-start text-[10px] uppercase tracking-wide" style={{ color: t.muted }}>
        login
      </span>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- pré-visualização
        <img src={logo} alt="" className="w-auto max-w-full object-contain" style={{ height: tamanho }} />
      ) : (
        <ShieldCheck className="size-8" style={{ color: destaque }} aria-hidden />
      )}
      {(mostrarNome || !logo) && (nome || subtitulo) && (
        <div>
          {nome && <p className="text-sm font-semibold">{nome}</p>}
          {subtitulo && <p className="text-xs" style={{ color: t.muted }}>{subtitulo}</p>}
        </div>
      )}
    </div>
  );
}
