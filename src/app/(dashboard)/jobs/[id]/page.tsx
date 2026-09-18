import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo } from "@/lib/auth/roles";
import { carregarFaixas } from "@/lib/dashboard/queries";
import { serializeBigInts } from "@/lib/db/serialize";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { HeatStrip, HeatStripLegenda } from "@/components/heat-strip";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { JOB_STATUS, PARSED_RESULT } from "@/lib/utils/status";
import { fmtBytes, fmtDataHora, fmtDuracao, fmtIntervalo, fmtNumero, fmtRelativo } from "@/lib/utils/format";
import { JobForm } from "./job-form";
import { PayloadViewer } from "./payload-viewer";

export const dynamic = "force-dynamic";

export default async function JobDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const job = await prisma.backupJob.findUnique({
    where: { id },
    include: {
      machine: {
        select: {
          id: true,
          hostname: true,
          displayName: true,
          status: true,
          client: { select: { id: true, name: true } },
        },
      },
      runs: { orderBy: { receivedAt: "desc" }, take: 30 },
    },
  });

  if (!job) notFound();

  const faixas = await carregarFaixas([job.id], 30);
  const ultima = job.runs[0];
  const runs = serializeBigInts(job.runs);

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.name}
        subtitle={`${job.machine.displayName ?? job.machine.hostname}${
          job.machine.client ? ` · ${job.machine.client.name}` : ""
        }`}
        actions={
          <Badge tone={JOB_STATUS[job.status].tone} dot>
            {JOB_STATUS[job.status].label}
          </Badge>
        }
      />

      {job.status === "LATE" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-late)]/30 bg-[var(--color-late-dim)] px-4 py-3 text-sm text-[var(--color-late)]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Este backup deveria ter rodado e não rodou.</p>
            <p className="mt-0.5 text-[var(--color-muted)]">
              Esperado {fmtRelativo(job.nextExpectedAt)}, último relatório {fmtRelativo(job.lastRunAt)}.
              Confira se a máquina está ligada e se o Duplicati está rodando.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Último resultado"
          value={ultima ? PARSED_RESULT[ultima.parsedResult].label : "—"}
          tone={ultima ? PARSED_RESULT[ultima.parsedResult].tone : "neutral"}
          hint={ultima ? fmtRelativo(ultima.receivedAt) : "nenhum relatório recebido"}
        />
        <StatTile
          label="Enviado na última execução"
          value={fmtBytes(ultima?.bytesUploaded ?? null)}
          hint={ultima ? `${fmtNumero(ultima.addedFiles ?? 0)} arquivo(s) adicionado(s)` : undefined}
        />
        <StatTile
          label="Duração"
          value={fmtDuracao(ultima?.durationSeconds ?? null)}
          hint={ultima ? `${fmtNumero(ultima.examinedFiles ?? 0)} arquivo(s) examinado(s)` : undefined}
        />
        <StatTile
          label="Próxima esperada"
          value={fmtRelativo(job.nextExpectedAt)}
          tone={job.status === "LATE" ? "late" : "neutral"}
          hint={fmtIntervalo(job.expectedIntervalMinutes)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos 30 dias</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <HeatStrip dias={faixas.get(job.id) ?? []} />
          <HeatStripLegenda />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de execuções</CardTitle>
            </CardHeader>
            {runs.length === 0 ? (
              <EmptyState title="Nenhuma execução registrada" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Recebido</Th>
                    <Th>Resultado</Th>
                    <Th>Duração</Th>
                    <Th>Enviado</Th>
                    <Th>Avisos</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <Tr key={run.id}>
                      <Td className="whitespace-nowrap text-[var(--color-muted)]">
                        {fmtDataHora(run.receivedAt)}
                      </Td>
                      <Td>
                        <Badge tone={PARSED_RESULT[run.parsedResult].tone} dot>
                          {PARSED_RESULT[run.parsedResult].label}
                        </Badge>
                      </Td>
                      <Td className="text-[var(--color-muted)]">{fmtDuracao(run.durationSeconds)}</Td>
                      <Td className="text-[var(--color-muted)]">{fmtBytes(run.bytesUploaded)}</Td>
                      <Td>
                        <span className="text-xs text-[var(--color-muted)]">
                          {run.warningsCount > 0 && `${run.warningsCount} warning(s) `}
                          {run.errorsCount > 0 && `${run.errorsCount} erro(s)`}
                          {run.warningsCount === 0 && run.errorsCount === 0 && "—"}
                        </span>
                        {run.parseError && (
                          <Badge tone="warn" className="ml-1">
                            parsing
                          </Badge>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {ultima && (
            <div className="mt-4 space-y-2">
              {ultima.parseError && (
                <p className="rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-3 py-2 text-xs text-[var(--color-warn)]">
                  Avisos de parsing do último relatório: {ultima.parseError}
                </p>
              )}
              <PayloadViewer payload={ultima.rawPayload} />
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configuração do monitoramento</CardTitle>
            </CardHeader>
            <CardBody>
              {podeAtuarComo(user.role, "OPERATOR") ? (
                <JobForm job={job} />
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Frequência</dt>
                    <dd>{fmtIntervalo(job.expectedIntervalMinutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Tolerância</dt>
                    <dd>{job.toleranceMinutes} minutos</dd>
                  </div>
                </dl>
              )}
              <div className="mt-5 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-muted)]">
                <p>
                  ID no Duplicati: <code className="font-mono">{job.duplicatiBackupId}</code>
                </p>
                <p className="mt-1">
                  Máquina:{" "}
                  <Link href={`/maquinas/${job.machine.id}`} className="text-[var(--color-info)]">
                    {job.machine.displayName ?? job.machine.hostname}
                  </Link>
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
