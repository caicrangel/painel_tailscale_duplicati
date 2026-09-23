import Link from "next/link";
import type { JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { carregarFaixas } from "@/lib/dashboard/queries";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { HeatStrip, HeatStripLegenda } from "@/components/heat-strip";
import { DetalhesMovel, ItemMovel, ListaMovel, SomenteDesktop } from "@/components/ui/lista-movel";
import { JOB_STATUS } from "@/lib/utils/status";
import { fmtIntervalo, fmtRelativo } from "@/lib/utils/format";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Jobs de backup · Painel" };
export const dynamic = "force-dynamic";

const STATUS: JobStatus[] = ["OK", "WARNING", "ERROR", "LATE", "PAUSED", "UNKNOWN"];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; status?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const where: Prisma.BackupJobWhereInput = {};
  if (sp.status && STATUS.includes(sp.status as JobStatus)) where.status = sp.status as JobStatus;
  if (sp.cliente) where.machine = { clientId: sp.cliente };

  const [jobs, clientes] = await Promise.all([
    prisma.backupJob.findMany({
      where,
      // Ordem do enum coloca OK primeiro; quem manda é a urgência.
      orderBy: [{ status: "asc" }, { nextExpectedAt: "asc" }],
      include: {
        machine: {
          select: { id: true, hostname: true, displayName: true, client: { select: { name: true } } },
        },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const PESO: Record<JobStatus, number> = {
    LATE: 0,
    ERROR: 1,
    WARNING: 2,
    UNKNOWN: 3,
    OK: 4,
    PAUSED: 5,
  };
  const ordenados = [...jobs].sort((a, b) => PESO[a.status] - PESO[b.status]);
  const faixas = await carregarFaixas(ordenados.map((j) => j.id), 14);

  return (
    <div>
      <AutoRefresh />
      <PageHeader title="Jobs de backup" subtitle={`${jobs.length} job(s) no filtro atual`} />

      <FilterBar
        filtros={[
          {
            name: "cliente",
            label: "Cliente",
            valor: sp.cliente ?? "",
            opcoes: [
              { value: "", label: "Todos os clientes" },
              ...clientes.map((c) => ({ value: c.id, label: c.name })),
            ],
          },
          {
            name: "status",
            label: "Status",
            valor: sp.status ?? "",
            opcoes: [
              { value: "", label: "Todos os status" },
              ...STATUS.map((s) => ({ value: s, label: JOB_STATUS[s].label })),
            ],
          },
        ]}
      />

      <Card>
        {ordenados.length === 0 ? (
          <EmptyState
            title="Nenhum job encontrado"
            hint="Jobs aparecem sozinhos quando o primeiro relatório do Duplicati chega com o token do cliente."
          />
        ) : (
          <>
            <ListaMovel>
              {ordenados.map((job) => (
                <ItemMovel
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  titulo={job.name}
                  subtitulo={
                    <>
                      {job.machine.displayName ?? job.machine.hostname}
                      {job.machine.client && ` · ${job.machine.client.name}`}
                    </>
                  }
                  lateral={
                    <Badge tone={JOB_STATUS[job.status].tone} dot>
                      {JOB_STATUS[job.status].label}
                    </Badge>
                  }
                >
                  <DetalhesMovel
                    itens={[
                      { rotulo: "Última execução", valor: fmtRelativo(job.lastRunAt) },
                      {
                        rotulo: "Próxima esperada",
                        valor: fmtRelativo(job.nextExpectedAt),
                        destaque:
                          job.status === "LATE" ? "font-medium text-[var(--color-late)]" : undefined,
                      },
                    ]}
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <HeatStrip dias={faixas.get(job.id) ?? []} />
                    <span className="truncate text-[11px] text-[var(--color-faint)]">
                      {fmtIntervalo(job.expectedIntervalMinutes)}
                    </span>
                  </div>
                </ItemMovel>
              ))}
            </ListaMovel>
            <SomenteDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th>Frequência</Th>
                    <Th>Última execução</Th>
                    <Th>Próxima esperada</Th>
                    <Th className="w-px whitespace-nowrap">14 dias</Th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((job) => (
                    <Tr key={job.id}>
                      <Td>
                        <Link href={`/jobs/${job.id}`} className="font-medium hover:text-[var(--color-info)]">
                          {job.name}
                        </Link>
                        <p className="text-xs text-[var(--color-faint)]">
                          {job.machine.displayName ?? job.machine.hostname}
                          {job.machine.client && ` · ${job.machine.client.name}`}
                        </p>
                      </Td>
                      <Td>
                        <Badge tone={JOB_STATUS[job.status].tone} dot>
                          {JOB_STATUS[job.status].label}
                        </Badge>
                      </Td>
                      <Td className="text-[var(--color-muted)]">
                        {fmtIntervalo(job.expectedIntervalMinutes)}
                        <span className="block text-xs text-[var(--color-faint)]">
                          tolerância {fmtIntervalo(job.toleranceMinutes).replace("a cada ", "")}
                        </span>
                      </Td>
                      <Td className="text-[var(--color-muted)]">{fmtRelativo(job.lastRunAt)}</Td>
                      <Td
                        className={
                          job.status === "LATE"
                            ? "font-medium text-[var(--color-late)]"
                            : "text-[var(--color-muted)]"
                        }
                      >
                        {fmtRelativo(job.nextExpectedAt)}
                      </Td>
                      <Td className="w-px whitespace-nowrap">
                        <HeatStrip dias={faixas.get(job.id) ?? []} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </SomenteDesktop>
            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <HeatStripLegenda />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
