import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { MachineStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { DetalhesMovel, ItemMovel, ListaMovel, NomeMaquina, SomenteDesktop } from "@/components/ui/lista-movel";
import { MACHINE_STATUS } from "@/lib/utils/status";
import { fmtRelativo } from "@/lib/utils/format";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Máquinas" };
export const dynamic = "force-dynamic";

const STATUS_VALIDOS: MachineStatus[] = ["ONLINE", "IDLE", "OFFLINE", "UNKNOWN"];

export default async function MaquinasPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; status?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const where: Prisma.MachineWhereInput = {};
  if (sp.cliente === "nao-atribuidas") {
    where.clientId = null;
    where.role = "CLIENTE";
  } else if (sp.cliente === "suporte") {
    where.role = "SUPORTE";
  } else if (sp.cliente) {
    where.clientId = sp.cliente;
  }
  if (sp.status && STATUS_VALIDOS.includes(sp.status as MachineStatus)) {
    where.status = sp.status as MachineStatus;
  }

  const [maquinas, clientes, naoAtribuidas] = await Promise.all([
    prisma.machine.findMany({
      where,
      orderBy: [{ status: "asc" }, { hostname: "asc" }],
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { backupJobs: true } },
        backupJobs: { select: { status: true } },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // "Não atribuída" só conta máquina de cliente: as de apoio não são pendência.
    prisma.machine.count({ where: { clientId: null, role: "CLIENTE" } }),
  ]);

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        title="Máquinas"
        subtitle={`${maquinas.length} máquina(s) no filtro atual`}
      />

      {naoAtribuidas > 0 && (
        <Link
          href="/maquinas?cliente=nao-atribuidas"
          className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-4 py-3 text-sm text-[var(--color-warn)]"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {naoAtribuidas} máquina(s) ainda não atribuída(s) a um cliente — vincule para que entrem
          no monitoramento.
        </Link>
      )}

      <FilterBar
        filtros={[
          {
            name: "cliente",
            label: "Cliente",
            valor: sp.cliente ?? "",
            opcoes: [
              { value: "", label: "Todos os clientes" },
              { value: "nao-atribuidas", label: "— Não atribuídas —" },
              { value: "suporte", label: "— Máquinas de apoio —" },
              ...clientes.map((c) => ({ value: c.id, label: c.name })),
            ],
          },
          {
            name: "status",
            label: "Status",
            valor: sp.status ?? "",
            opcoes: [
              { value: "", label: "Todos os status" },
              ...STATUS_VALIDOS.map((s) => ({ value: s, label: MACHINE_STATUS[s].label })),
            ],
          },
        ]}
      />

      <Card>
        {maquinas.length === 0 ? (
          <EmptyState
            title="Nenhuma máquina encontrada"
            hint="Máquinas aparecem automaticamente quando o worker sincroniza os devices da tailnet."
          />
        ) : (
          <>
            <ListaMovel>
              {maquinas.map((m) => {
                const comProblema = m.backupJobs.filter(
                  (j) => j.status === "ERROR" || j.status === "LATE",
                ).length;
                return (
                  <ItemMovel
                    key={m.id}
                    href={`/maquinas/${m.id}`}
                    titulo={<NomeMaquina nome={m.displayName ?? m.hostname} />}
                    subtitulo={
                      m.role === "SUPORTE"
                        ? "Apoio · atende todos os clientes"
                        : (m.client?.name ?? "Não atribuída a um cliente")
                    }
                    lateral={
                      <>
                        <Badge tone={MACHINE_STATUS[m.status].tone} dot>
                          {MACHINE_STATUS[m.status].label}
                        </Badge>
                        {m.updateAvailable && <Badge tone="info">update</Badge>}
                        {!m.client && m.role !== "SUPORTE" && <Badge tone="warn">atribuir</Badge>}
                      </>
                    }
                  >
                    <DetalhesMovel
                      itens={[
                        { rotulo: "Último contato", valor: fmtRelativo(m.lastSeen) },
                        {
                          rotulo: "Jobs",
                          valor:
                            comProblema > 0
                              ? `${m._count.backupJobs} · ${comProblema} com problema`
                              : String(m._count.backupJobs),
                          destaque: comProblema > 0 ? "font-medium text-[var(--color-danger)]" : undefined,
                        },
                      ]}
                    />
                  </ItemMovel>
                );
              })}
            </ListaMovel>
            <SomenteDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Máquina</Th>
                    <Th>Status</Th>
                    <Th>Jobs</Th>
                    <Th>SO</Th>
                    <Th>Último contato</Th>
                  </tr>
                </thead>
                <tbody>
                  {maquinas.map((m) => {
                    const comProblema = m.backupJobs.filter(
                      (j) => j.status === "ERROR" || j.status === "LATE",
                    ).length;
                    return (
                      <Tr key={m.id}>
                        <Td>
                          {m.role === "SUPORTE" ? (
                            <Badge tone="info">apoio · todos os clientes</Badge>
                          ) : m.client ? (
                            <Link
                              href={`/clientes/${m.client.id}`}
                              className="text-[var(--color-muted)] hover:text-[var(--color-info)]"
                            >
                              {m.client.name}
                            </Link>
                          ) : (
                            <Badge tone="warn">não atribuída</Badge>
                          )}
                        </Td>
                        <Td>
                          <Link
                            href={`/maquinas/${m.id}`}
                            className="font-medium hover:text-[var(--color-info)]"
                          >
                            {m.displayName ?? m.hostname}
                          </Link>
                          {m.updateAvailable && (
                            <Badge tone="info" className="ml-2">
                              update
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={MACHINE_STATUS[m.status].tone} dot>
                            {MACHINE_STATUS[m.status].label}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="tabular-nums">{m._count.backupJobs}</span>
                          {comProblema > 0 && (
                            <Badge tone="danger" className="ml-2">
                              {comProblema}
                            </Badge>
                          )}
                        </Td>
                        <Td className="text-[var(--color-muted)]">{m.os ?? "—"}</Td>
                        <Td className="text-[var(--color-muted)]">{fmtRelativo(m.lastSeen)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </SomenteDesktop>
          </>
        )}
      </Card>
    </div>
  );
}
