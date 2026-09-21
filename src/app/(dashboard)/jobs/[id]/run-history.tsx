"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PARSED_RESULT } from "@/lib/utils/status";
import { fmtBytes, fmtDataHora, fmtDuracao, fmtNumero } from "@/lib/utils/format";
import { PayloadViewer } from "./payload-viewer";

export type ItemSerializado = { rotulo: string; quantidade: number | null; bytes: number | null };
export type SecaoSerializada = { titulo: string; itens: ItemSerializado[] };

export type LinhaExecucao = {
  id: string;
  receivedAt: string;
  parsedResult: keyof typeof PARSED_RESULT;
  durationSeconds: number | null;
  bytesUploaded: number | null;
  warningsCount: number;
  errorsCount: number;
  parseError: string | null;
  rawPayload: unknown;
  resumo: {
    operacao: string | null;
    versao: string | null;
    inicio: string | null;
    fim: string | null;
    duracaoSegundos: number | null;
    sinalizadores: string[];
    secoes: SecaoSerializada[];
    avisos: string[];
    erros: string[];
    mensagensCount: number;
    vazio: boolean;
  };
};

export function RunHistory({ linhas }: { linhas: LinhaExecucao[] }) {
  // A execução mais recente já abre expandida: é a que o operador quer ver.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(linhas[0] ? [linhas[0].id] : []),
  );

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-px" />
          <Th>Recebido</Th>
          <Th>Resultado</Th>
          <Th>Duração</Th>
          <Th>Enviado</Th>
          <Th>Avisos</Th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => {
          const aberto = abertos.has(linha.id);
          return (
            <Fragment key={linha.id}>
              <Tr className="cursor-pointer" onClick={() => alternar(linha.id)}>
                <Td className="w-px pr-0">
                  <button
                    type="button"
                    aria-expanded={aberto}
                    aria-label={aberto ? "Recolher resumo" : "Ver resumo da execução"}
                    className="flex size-6 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                  >
                    {aberto ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                </Td>
                <Td className="whitespace-nowrap text-[var(--color-muted)]">
                  {fmtDataHora(linha.receivedAt)}
                </Td>
                <Td>
                  <Badge tone={PARSED_RESULT[linha.parsedResult].tone} dot>
                    {PARSED_RESULT[linha.parsedResult].label}
                  </Badge>
                </Td>
                <Td className="text-[var(--color-muted)]">{fmtDuracao(linha.durationSeconds)}</Td>
                <Td className="text-[var(--color-muted)]">{fmtBytes(linha.bytesUploaded)}</Td>
                <Td>
                  <span className="text-xs text-[var(--color-muted)]">
                    {linha.warningsCount > 0 && `${linha.warningsCount} warning(s) `}
                    {linha.errorsCount > 0 && `${linha.errorsCount} erro(s)`}
                    {linha.warningsCount === 0 && linha.errorsCount === 0 && "—"}
                  </span>
                  {linha.parseError && (
                    <Badge tone="warn" className="ml-1">
                      parsing
                    </Badge>
                  )}
                </Td>
              </Tr>

              {aberto && (
                <tr>
                  <td colSpan={6} className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 py-4">
                    <ResumoExecucao linha={linha} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}

function ResumoExecucao({ linha }: { linha: LinhaExecucao }) {
  const { resumo } = linha;

  if (resumo.vazio) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          O Duplicati não enviou detalhes desta execução — ou o relatório chegou num formato que
          não conseguimos interpretar. O conteúdo original está preservado abaixo.
        </p>
        <PayloadViewer payload={linha.rawPayload} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        {resumo.operacao && (
          <span>
            Operação: <strong className="font-medium text-[var(--color-fg)]">{resumo.operacao}</strong>
          </span>
        )}
        {resumo.inicio && <span>Início: {fmtDataHora(resumo.inicio)}</span>}
        {resumo.fim && <span>Fim: {fmtDataHora(resumo.fim)}</span>}
        {resumo.duracaoSegundos !== null && (
          <span>Duração: {fmtDuracao(resumo.duracaoSegundos)}</span>
        )}
        {resumo.versao && <span>Duplicati {resumo.versao}</span>}
        {resumo.mensagensCount > 0 && <span>{fmtNumero(resumo.mensagensCount)} mensagem(ns) de log</span>}
      </div>

      {resumo.sinalizadores.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resumo.sinalizadores.map((s) => (
            <Badge key={s} tone="warn">
              {s}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {resumo.secoes.map((secao) => (
          <div
            key={secao.titulo}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              {secao.titulo}
            </p>
            <dl className="space-y-1.5">
              {secao.itens.map((item) => (
                <div key={item.rotulo} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-[var(--color-muted)]">{item.rotulo}</dt>
                  <dd className="text-right tabular-nums">
                    {item.quantidade !== null && (
                      <span className="font-medium">{fmtNumero(item.quantidade)}</span>
                    )}
                    {item.bytes !== null && (
                      <span
                        className={
                          item.quantidade !== null
                            ? "ml-2 text-xs text-[var(--color-faint)]"
                            : "font-medium"
                        }
                      >
                        {fmtBytes(item.bytes)}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {resumo.erros.length > 0 && (
        <ListaMensagens titulo="Erros" mensagens={resumo.erros} tom="danger" Icone={XCircle} />
      )}
      {resumo.avisos.length > 0 && (
        <ListaMensagens titulo="Avisos" mensagens={resumo.avisos} tom="warn" Icone={AlertTriangle} />
      )}

      {linha.parseError && (
        <p className="rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-3 py-2 text-xs text-[var(--color-warn)]">
          Avisos de parsing: {linha.parseError}
        </p>
      )}

      <PayloadViewer payload={linha.rawPayload} />
    </div>
  );
}

function ListaMensagens({
  titulo,
  mensagens,
  tom,
  Icone,
}: {
  titulo: string;
  mensagens: string[];
  tom: "danger" | "warn";
  Icone: typeof XCircle;
}) {
  const cor = tom === "danger" ? "var(--color-danger)" : "var(--color-warn)";
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: `color-mix(in srgb, ${cor} 30%, transparent)` }}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: cor }}>
        <Icone className="size-3.5" />
        {titulo} ({mensagens.length})
      </p>
      <ul className="space-y-1">
        {mensagens.map((m, i) => (
          <li
            key={i}
            className="break-words font-mono text-xs leading-relaxed text-[var(--color-muted)]"
          >
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
