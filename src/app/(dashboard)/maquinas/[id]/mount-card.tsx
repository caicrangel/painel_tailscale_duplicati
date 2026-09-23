import { HardDrive } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { MOUNT_POINT_STATUS, MOUNT_RESULT } from "@/lib/utils/status";
import { fmtDataHora, fmtDuracao, fmtRelativo } from "@/lib/utils/format";

type Ponto = {
  id: string;
  path: string;
  status: keyof typeof MOUNT_POINT_STATUS;
  fsTypeExpected: string | null;
  fsTypeActual: string | null;
  detail: string | null;
  size: string | null;
  used: string | null;
  available: string | null;
  usePercent: string | null;
};

export type VerificacaoMontagem = {
  id: string;
  result: keyof typeof MOUNT_RESULT;
  receivedAt: Date;
  durationSeconds: number | null;
  bootAt: Date | null;
  bootRecent: boolean;
  parseError: string | null;
  points: Ponto[];
};

/**
 * Última verificação de montagens da máquina.
 *
 * A checagem e a remontagem continuam acontecendo na máquina (precisam de root
 * e das syscalls de mount). O que o painel faz é guardar o resultado, mostrar o
 * histórico e alertar — inclusive quando a verificação deixa de chegar.
 */
export function MountCard({
  ultima,
  total,
  intervaloMinutos,
}: {
  ultima: VerificacaoMontagem | null;
  total: number;
  intervaloMinutos: number | null;
}) {
  if (!ultima) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verificação de montagens</CardTitle>
        </CardHeader>
        <EmptyState
          title="Esta máquina ainda não reportou"
          hint="Instale o script check-mounts.sh nela e aponte para o endpoint de montagens do painel. O guia está no README."
        />
      </Card>
    );
  }

  const falhas = ultima.points.filter((p) => p.status === "FAILED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação de montagens</CardTitle>
        <div className="flex items-center gap-2">
          {intervaloMinutos === null && <Badge tone="neutral">atraso não vigiado</Badge>}
          <Badge tone={MOUNT_RESULT[ultima.result].tone} dot>
            {MOUNT_RESULT[ultima.result].label}
          </Badge>
        </div>
      </CardHeader>

      <CardBody className="border-b border-[var(--color-border)] py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="size-3.5" />
            {ultima.points.length} ponto(s)
            {falhas > 0 && (
              <span className="font-medium text-[var(--color-danger)]">· {falhas} com falha</span>
            )}
          </span>
          <span>
            Recebida {fmtRelativo(ultima.receivedAt)} ({fmtDataHora(ultima.receivedAt)})
          </span>
          {ultima.durationSeconds !== null && (
            <span>Duração {fmtDuracao(ultima.durationSeconds)}</span>
          )}
          {ultima.bootAt && <span>Último boot {fmtDataHora(ultima.bootAt)}</span>}
          <span className="text-[var(--color-faint)]">{total} verificação(ões) no histórico</span>
        </div>

        {ultima.bootRecent && (
          <p className="mt-2 rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-3 py-2 text-xs text-[var(--color-warn)]">
            A máquina reiniciou há pouco — é a causa mais comum de share desmontado.
          </p>
        )}
        {ultima.parseError && (
          <p className="mt-2 text-xs text-[var(--color-warn)]">
            Avisos de parsing: {ultima.parseError}
          </p>
        )}
      </CardBody>

      {ultima.points.length === 0 ? (
        <EmptyState title="O relatório não trouxe nenhum ponto" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Ponto</Th>
              <Th>Situação</Th>
              <Th className="hidden sm:table-cell">Tipo</Th>
              <Th>Uso</Th>
            </tr>
          </thead>
          <tbody>
            {ultima.points.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <code className="font-mono text-xs">{p.path}</code>
                  {p.detail && (
                    <p className="mt-0.5 text-xs text-[var(--color-danger)]">{p.detail}</p>
                  )}
                </Td>
                <Td>
                  <Badge tone={MOUNT_POINT_STATUS[p.status].tone} dot>
                    {MOUNT_POINT_STATUS[p.status].label}
                  </Badge>
                </Td>
                <Td className="hidden text-xs text-[var(--color-muted)] sm:table-cell">
                  {p.fsTypeActual ?? "—"}
                  {p.fsTypeExpected && p.fsTypeActual && p.fsTypeExpected !== p.fsTypeActual && (
                    <span className="ml-1 text-[var(--color-danger)]">
                      (esperado {p.fsTypeExpected})
                    </span>
                  )}
                </Td>
                <Td className="text-xs text-[var(--color-muted)]">
                  {p.usePercent || p.available ? (
                    <>
                      {p.usePercent ?? "—"}
                      {p.available && (
                        <span className="block whitespace-nowrap text-[var(--color-faint)] sm:inline">
                          <span className="hidden sm:inline"> · </span>livre {p.available}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
