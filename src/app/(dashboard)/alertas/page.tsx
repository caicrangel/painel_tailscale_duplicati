import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/table";
import { ALERT_SEVERITY, ALERT_TYPE } from "@/lib/utils/status";
import { fmtDataHora, fmtRelativo } from "@/lib/utils/format";
import { AcknowledgeButton } from "./acknowledge-button";

export const metadata = { title: "Alertas · Painel" };
export const dynamic = "force-dynamic";

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mostrarFechados = sp.estado === "fechados";

  const alertas = await prisma.alert.findMany({
    where: mostrarFechados ? { closedAt: { not: null } } : { closedAt: null },
    orderBy: mostrarFechados
      ? { closedAt: "desc" }
      : [{ severity: "asc" }, { openedAt: "asc" }],
    take: 100,
    include: {
      client: { select: { id: true, name: true } },
      machine: { select: { id: true, hostname: true, displayName: true } },
      backupJob: { select: { id: true, name: true } },
      acknowledgedBy: { select: { name: true } },
      notifications: { select: { kind: true, status: true, lastError: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Alertas"
        subtitle={
          mostrarFechados
            ? "Incidentes já resolvidos (últimos 100)"
            : "Incidentes abertos, do mais grave para o mais antigo"
        }
      />

      <FilterBar
        filtros={[
          {
            name: "estado",
            label: "Estado",
            valor: sp.estado ?? "",
            opcoes: [
              { value: "", label: "Abertos" },
              { value: "fechados", label: "Resolvidos" },
            ],
          },
        ]}
      />

      <Card>
        {alertas.length === 0 ? (
          <EmptyState
            title={mostrarFechados ? "Nenhum incidente resolvido ainda" : "Nenhum alerta aberto"}
            hint={
              mostrarFechados
                ? undefined
                : "Máquinas respondendo e backups em dia. Alertas aparecem aqui automaticamente."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]/60">
            {alertas.map((alerta) => {
              const envioFalhou = alerta.notifications.some((n) => n.status === "FAILED");
              return (
                <li key={alerta.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ALERT_SEVERITY[alerta.severity].tone} dot>
                          {ALERT_SEVERITY[alerta.severity].label}
                        </Badge>
                        <Badge tone={ALERT_TYPE[alerta.type].tone}>
                          {ALERT_TYPE[alerta.type].label}
                        </Badge>
                        {alerta.acknowledgedAt && (
                          <Badge tone="info">
                            reconhecido por {alerta.acknowledgedBy?.name ?? "—"}
                          </Badge>
                        )}
                        {envioFalhou && <Badge tone="warn">Telegram falhou</Badge>}
                      </div>

                      <p className="mt-1.5 text-sm font-medium">{alerta.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--color-muted)]">{alerta.message}</p>

                      <p className="mt-1.5 text-xs text-[var(--color-faint)]">
                        {alerta.client && (
                          <Link href={`/clientes/${alerta.client.id}`} className="hover:text-[var(--color-info)]">
                            {alerta.client.name}
                          </Link>
                        )}
                        {" · aberto "}
                        {fmtDataHora(alerta.openedAt)} ({fmtRelativo(alerta.openedAt)})
                        {alerta.closedAt && ` · resolvido ${fmtDataHora(alerta.closedAt)}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {alerta.backupJob && (
                        <Link
                          href={`/jobs/${alerta.backupJob.id}`}
                          className="text-xs text-[var(--color-info)]"
                        >
                          ver job
                        </Link>
                      )}
                      {alerta.machine && (
                        <Link
                          href={`/maquinas/${alerta.machine.id}`}
                          className="text-xs text-[var(--color-info)]"
                        >
                          ver máquina
                        </Link>
                      )}
                      {!alerta.closedAt &&
                        !alerta.acknowledgedAt &&
                        podeAtuarComo(user.role, "OPERATOR") && <AcknowledgeButton id={alerta.id} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
