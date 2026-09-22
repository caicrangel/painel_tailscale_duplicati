import Link from "next/link";
import { CheckCircle2, CircleHelp, HardDrive, RotateCw, XCircle } from "lucide-react";
import type { MontagemDaMaquina, PontoDoPanorama } from "@/lib/dashboard/queries";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { MOUNT_RESULT } from "@/lib/utils/status";
import { fmtRelativo } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Panorama de montagens de todos os clientes.
 *
 * O objetivo é decidir em um relance: qual share, de qual cliente, está fora.
 * Por isso os pontos aparecem abertos na linha da máquina em vez de escondidos
 * atrás de um clique — quem olha o dashboard quer ver o caminho que falhou.
 *
 * Cor nunca é o único canal (mesma regra da faixa de execuções): cada ponto
 * carrega um ícone próprio e um title com o motivo da falha.
 */

const PONTO: Record<PontoDoPanorama["status"], { tone: Tone; Icone: typeof CheckCircle2; rotulo: string }> = {
  OK: { tone: "ok", Icone: CheckCircle2, rotulo: "estável" },
  REMOUNTED: { tone: "warn", Icone: RotateCw, rotulo: "remontado" },
  FAILED: { tone: "danger", Icone: XCircle, rotulo: "falhou" },
  UNKNOWN: { tone: "neutral", Icone: CircleHelp, rotulo: "desconhecido" },
};

const ANEL: Record<Tone, string> = {
  ok: "border-[var(--color-ok)]/30 bg-[var(--color-ok-dim)] text-[var(--color-ok)]",
  warn: "border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] text-[var(--color-warn)]",
  danger: "border-[var(--color-danger)]/40 bg-[var(--color-danger-dim)] text-[var(--color-danger)]",
  late: "border-[var(--color-late)]/30 bg-[var(--color-late-dim)] text-[var(--color-late)]",
  info: "border-[var(--color-info)]/30 bg-[var(--color-info-dim)] text-[var(--color-info)]",
  idle: "border-[var(--color-idle)]/30 bg-[var(--color-idle-dim)] text-[var(--color-idle)]",
  neutral: "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]",
};

function Ponto({ ponto, esmaecido }: { ponto: PontoDoPanorama; esmaecido: boolean }) {
  const { tone, Icone, rotulo } = PONTO[ponto.status];
  const uso = ponto.usePercent ?? "";

  const descricao = [
    `${ponto.path} — ${rotulo}`,
    ponto.detail,
    ponto.available ? `livre ${ponto.available}` : null,
    esmaecido ? "leitura antiga: a verificação parou de chegar" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={descricao}
      aria-label={descricao}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        ANEL[tone],
        // Verificação parada: o que está na tela é a última leitura, não o agora.
        esmaecido && "opacity-50",
      )}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden />
      <code className="truncate font-mono">{ponto.path}</code>
      {uso && <span className="shrink-0 opacity-70">{uso}</span>}
    </span>
  );
}

function Pontos({ montagem }: { montagem: MontagemDaMaquina }) {
  if (montagem.pontos.length === 0) {
    return (
      <span className="text-xs text-[var(--color-faint)]">o relatório não trouxe pontos</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {montagem.pontos.map((p) => (
        <Ponto key={p.id} ponto={p} esmaecido={montagem.parada} />
      ))}
    </div>
  );
}

export function MountOverview({ maquinas, semReporte }: { maquinas: MontagemDaMaquina[]; semReporte: number }) {
  if (maquinas.length === 0) {
    return (
      <EmptyState
        title="Nenhuma máquina reportou montagens ainda"
        hint="Instale o check-mounts.sh nas máquinas dos clientes e aponte para o endpoint de montagens. O guia está no README."
      />
    );
  }

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Máquina</Th>
            <Th>Situação</Th>
            {/* No celular os pontos sobem para a célula da máquina: são o dado
                central da tela e não podem ficar atrás de scroll horizontal. */}
            <Th className="hidden md:table-cell">Pontos de montagem</Th>
            <Th className="hidden w-px whitespace-nowrap md:table-cell">Verificada</Th>
          </tr>
        </thead>
        <tbody>
          {maquinas.map((m) => {
            const falhas = m.pontos.filter((p) => p.status === "FAILED").length;

            return (
              <Tr key={m.machineId}>
                <Td className="max-w-[14rem] align-top">
                  <Link
                    href={`/maquinas/${m.machineId}`}
                    className="block truncate font-medium hover:text-[var(--color-info)]"
                  >
                    {m.nome}
                  </Link>
                  <p className="truncate text-xs text-[var(--color-faint)]">
                    {m.cliente ?? "sem cliente"}
                  </p>

                  <div className="mt-2 md:hidden">
                    <Pontos montagem={m} />
                    <p className="mt-1 text-xs text-[var(--color-faint)]">
                      verificada {fmtRelativo(m.recebidaEm)}
                      {!m.vigiada && " · atraso não vigiado"}
                    </p>
                  </div>
                </Td>

                <Td className="align-top">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={MOUNT_RESULT[m.resultado].tone} dot>
                      {MOUNT_RESULT[m.resultado].label}
                    </Badge>
                    {m.parada && <Badge tone="late">verificação parada</Badge>}
                    {falhas > 0 && (
                      <span className="text-xs text-[var(--color-danger)]">
                        {falhas} de {m.pontos.length} ponto(s)
                      </span>
                    )}
                  </div>
                </Td>

                <Td className="hidden align-top md:table-cell">
                  <Pontos montagem={m} />
                </Td>

                <Td className="hidden w-px whitespace-nowrap align-top text-xs text-[var(--color-muted)] md:table-cell">
                  {fmtRelativo(m.recebidaEm)}
                  {!m.vigiada && (
                    <p className="text-[var(--color-faint)]">atraso não vigiado</p>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="size-3.5" aria-hidden />
          {maquinas.reduce((acc, m) => acc + m.pontos.length, 0)} ponto(s) em {maquinas.length}{" "}
          máquina(s)
        </span>
        {semReporte > 0 && (
          <span>
            {semReporte} máquina(s) de cliente ainda sem o script de verificação
          </span>
        )}
      </div>
    </>
  );
}
