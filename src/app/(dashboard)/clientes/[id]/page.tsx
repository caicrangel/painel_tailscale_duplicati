import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo, podeVerTokenDeIngestao } from "@/lib/auth/roles";
import { env } from "@/lib/config/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { atualizarCliente } from "@/server/clients-actions";
import { MACHINE_STATUS, JOB_STATUS } from "@/lib/utils/status";
import { fmtRelativo } from "@/lib/utils/format";
import { ClientForm } from "../client-form";
import { TokensPanel } from "./tokens-panel";

export const dynamic = "force-dynamic";

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: {
      ingestTokens: { orderBy: { createdAt: "desc" } },
      machines: {
        orderBy: { hostname: "asc" },
        include: { _count: { select: { backupJobs: true } }, backupJobs: { select: { status: true } } },
      },
    },
  });

  if (!cliente) notFound();

  const podeEditar = podeAtuarComo(user.role, "OPERATOR");

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.name}
        subtitle={`${cliente.machines.length} máquina(s) · plano ${cliente.plan.toLowerCase()}`}
        actions={
          <Badge tone={cliente.active ? "ok" : "neutral"}>
            {cliente.active ? "Ativo" : "Inativo"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          {podeVerTokenDeIngestao(user.role) ? (
            <Card>
              <CardHeader>
                <CardTitle>Ingestão do Duplicati</CardTitle>
              </CardHeader>
              <CardBody>
                <TokensPanel
                  clientId={cliente.id}
                  tokens={cliente.ingestTokens}
                  baseUrl={env().APP_BASE_URL}
                  podeAdministrar={podeAtuarComo(user.role, "ADMIN")}
                />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-[var(--color-muted)]">
                  O token de ingestão é visível apenas para operadores e administradores.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Máquinas</CardTitle>
            </CardHeader>
            {cliente.machines.length === 0 ? (
              <EmptyState
                title="Nenhuma máquina vinculada"
                hint="Máquinas aparecem aqui quando o worker do Tailscale as descobre ou quando o primeiro relatório do Duplicati chega com este token."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Máquina</Th>
                    <Th>Status</Th>
                    <Th>Jobs</Th>
                    <Th>Último contato</Th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.machines.map((m) => {
                    const problemas = m.backupJobs.filter(
                      (j) => j.status === "ERROR" || j.status === "LATE",
                    ).length;
                    return (
                      <Tr key={m.id}>
                        <Td>
                          <Link
                            href={`/maquinas/${m.id}`}
                            className="font-medium hover:text-[var(--color-info)]"
                          >
                            {m.displayName ?? m.hostname}
                          </Link>
                          <p className="text-xs text-[var(--color-faint)]">{m.os ?? "SO não informado"}</p>
                        </Td>
                        <Td>
                          <Badge tone={MACHINE_STATUS[m.status].tone} dot>
                            {MACHINE_STATUS[m.status].label}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="tabular-nums">{m._count.backupJobs}</span>
                          {problemas > 0 && (
                            <Badge tone={JOB_STATUS.ERROR.tone} className="ml-2">
                              {problemas} com problema
                            </Badge>
                          )}
                        </Td>
                        <Td className="text-[var(--color-muted)]">{fmtRelativo(m.lastSeen)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{podeEditar ? "Dados do cliente" : "Dados"}</CardTitle>
            </CardHeader>
            <CardBody>
              {podeEditar ? (
                <ClientForm
                  cliente={cliente}
                  action={atualizarCliente.bind(null, cliente.id)}
                  submitLabel="Salvar alterações"
                />
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Contato</dt>
                    <dd>{cliente.contactName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">E-mail</dt>
                    <dd>{cliente.contactEmail ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Telefone</dt>
                    <dd>{cliente.contactPhone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Observações</dt>
                    <dd className="whitespace-pre-wrap">{cliente.notes ?? "—"}</dd>
                  </div>
                </dl>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
