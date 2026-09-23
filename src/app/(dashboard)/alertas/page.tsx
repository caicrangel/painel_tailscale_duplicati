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
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Alertas" };
export const dynamic = "force-dynamic";

/** No celular vira botão com área de toque de verdade; no desktop, link discreto. */
const LINK_ACAO =
  "inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-xs text-[var(--color-info)] " +
  "sm:h-auto sm:border-0 sm:px-0";

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
      <AutoRefresh />
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

                      {/* Hostname da tailnet é uma palavra só de 35 caracteres: sem
                          quebra em qualquer ponto, ele estoura a largura do celular. */}
                      <p className="mt-1.5 text-sm font-medium [overflow-wrap:anywhere]">{alerta.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--color-muted)] [overflow-wrap:anywhere]">
                        {alerta.message}
                      </p>

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

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {alerta.backupJob && (
                        <Link href={`/jobs/${alerta.backupJob.id}`} className={LINK_ACAO}>
                          ver job
                        </Link>
                      )}
                      {alerta.machine && (
                        <Link href={`/maquinas/${alerta.machine.id}`} className={LINK_ACAO}>
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
