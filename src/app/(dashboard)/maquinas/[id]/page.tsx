import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { MACHINE_STATUS, JOB_STATUS } from "@/lib/utils/status";
import { fmtDataHora, fmtIntervalo, fmtRelativo } from "@/lib/utils/format";
import { AssignForm } from "./assign-form";
import { MergeForm } from "./merge-form";

export const dynamic = "force-dynamic";

export default async function MaquinaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [maquina, clientes, devicesTailscale] = await Promise.all([
    prisma.machine.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        backupJobs: { orderBy: { name: "asc" } },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.machine.findMany({
      where: { tailscaleDeviceId: { not: null } },
      orderBy: { hostname: "asc" },
      select: { id: true, hostname: true, displayName: true, client: { select: { name: true } } },
    }),
  ]);

  if (!maquina) notFound();

  const emManutencao =
    maquina.maintenanceUntil !== null && maquina.maintenanceUntil.getTime() > Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title={maquina.displayName ?? maquina.hostname}
        subtitle={
          maquina.client ? `Cliente: ${maquina.client.name}` : "Máquina ainda não atribuída"
        }
        actions={
          <div className="flex items-center gap-2">
            {emManutencao && <Badge tone="info">em manutenção</Badge>}
            <Badge tone={MACHINE_STATUS[maquina.status].tone} dot>
              {MACHINE_STATUS[maquina.status].label}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Jobs de backup</CardTitle>
            </CardHeader>
            {maquina.backupJobs.length === 0 ? (
              <EmptyState
                title="Nenhum job reportou ainda"
                hint="Os jobs aparecem sozinhos no primeiro relatório que o Duplicati enviar com o token deste cliente."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th>Frequência</Th>
                    <Th>Última execução</Th>
                    <Th>Próxima esperada</Th>
                  </tr>
                </thead>
                <tbody>
                  {maquina.backupJobs.map((j) => (
                    <Tr key={j.id}>
                      <Td>
                        <Link href={`/jobs/${j.id}`} className="font-medium hover:text-[var(--color-info)]">
                          {j.name}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={JOB_STATUS[j.status].tone} dot>
                          {JOB_STATUS[j.status].label}
                        </Badge>
                      </Td>
                      <Td className="text-[var(--color-muted)]">
                        {fmtIntervalo(j.expectedIntervalMinutes)}
                      </Td>
                      <Td className="text-[var(--color-muted)]">{fmtRelativo(j.lastRunAt)}</Td>
                      <Td className="text-[var(--color-muted)]">{fmtRelativo(j.nextExpectedAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações do Tailscale</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Info label="Hostname" value={maquina.hostname} />
                <Info label="Sistema operacional" value={maquina.os ?? "—"} />
                <Info label="Versão do Tailscale" value={maquina.tailscaleVersion ?? "—"} />
                <Info
                  label="Atualização disponível"
                  value={maquina.updateAvailable ? "Sim" : "Não"}
                />
                <Info label="Último contato" value={fmtDataHora(maquina.lastSeen)} />
                <Info label="Origem do cadastro" value={maquina.source} />
                <Info
                  label="Endereços"
                  value={maquina.addresses.length ? maquina.addresses.join(", ") : "—"}
                />
                <Info label="Tags" value={maquina.tags.length ? maquina.tags.join(", ") : "—"} />
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
            </CardHeader>
            <CardBody>
              {podeAtuarComo(user.role, "OPERATOR") ? (
                <div className="space-y-5">
                  <AssignForm machine={maquina} clientes={clientes} />
                  {maquina.tailscaleDeviceId === null && (
                    <div className="border-t border-[var(--color-border)] pt-5">
                      <MergeForm
                        machineId={maquina.id}
                        hostname={maquina.hostname}
                        devices={devicesTailscale.map((d) => ({
                          id: d.id,
                          rotulo: `${d.displayName ?? d.hostname}${d.client ? ` · ${d.client.name}` : " · sem cliente"}`,
                        }))}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">
                  Somente operadores e administradores podem alterar a máquina.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
      <dd className="truncate font-mono text-xs text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
