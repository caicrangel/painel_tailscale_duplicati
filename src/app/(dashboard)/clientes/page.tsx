import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusSummary, type ItemStatus } from "@/components/status-summary";
import { ItemMovel, ListaMovel, SomenteDesktop } from "@/components/ui/lista-movel";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const PLANO_LABEL = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  CORPORATIVO: "Corporativo",
} as const;

export default async function ClientesPage() {
  const user = await requireUser();

  const clientes = await prisma.client.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      machines: {
        select: { status: true, backupJobs: { select: { status: true } } },
      },
      _count: { select: { machines: true, ingestTokens: true } },
    },
  });

  const linhas = clientes.map((c) => {
    const conta = (status: string) => c.machines.filter((m) => m.status === status).length;
    const jobs = c.machines.flatMap((m) => m.backupJobs);
    const contaJob = (status: string) => jobs.filter((j) => j.status === status).length;

    const maquinas: ItemStatus[] = [
      { valor: conta("ONLINE"), label: "online", tone: "ok" },
      { valor: conta("IDLE"), label: "ociosa(s)", tone: "idle" },
      { valor: conta("OFFLINE"), label: "offline", tone: "danger" },
      { valor: conta("UNKNOWN"), label: "sem contato", tone: "neutral" },
    ];
    const backups: ItemStatus[] = [
      { valor: contaJob("LATE"), label: "atrasado(s)", tone: "late" },
      { valor: contaJob("ERROR"), label: "com erro", tone: "danger" },
      { valor: contaJob("WARNING"), label: "warning", tone: "warn" },
      { valor: contaJob("OK"), label: "OK", tone: "ok" },
      { valor: contaJob("UNKNOWN"), label: "sem dados", tone: "neutral" },
      { valor: contaJob("PAUSED"), label: "pausado(s)", tone: "neutral" },
    ];
    return { cliente: c, maquinas, backups };
  });

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} cliente(s) atendido(s)`}
        actions={
          podeAtuarComo(user.role, "OPERATOR") && (
            <Link href="/clientes/novo">
              <Button>
                <Plus className="size-4" />
                Novo cliente
              </Button>
            </Link>
          )
        }
      />

      <Card>
        {clientes.length === 0 ? (
          <EmptyState
            title="Nenhum cliente cadastrado"
            hint="Cadastre o primeiro cliente para gerar o token de ingestão e configurar o Duplicati das máquinas dele."
          />
        ) : (
          <>
            <ListaMovel>
              {linhas.map(({ cliente: c, maquinas, backups }) => (
                <ItemMovel
                  key={c.id}
                  href={`/clientes/${c.id}`}
                  titulo={c.name}
                  subtitulo={[PLANO_LABEL[c.plan], c.contactEmail].filter(Boolean).join(" · ")}
                  lateral={
                    <Badge tone={c.active ? "ok" : "neutral"}>{c.active ? "Ativo" : "Inativo"}</Badge>
                  }
                >
                  <dl className="space-y-2">
                    <div className="flex items-start gap-3">
                      <dt className="w-16 shrink-0 pt-0.5 text-[11px] text-[var(--color-faint)]">Máquinas</dt>
                      <dd className="min-w-0">
                        <StatusSummary vazio="nenhuma máquina" itens={maquinas} />
                      </dd>
                    </div>
                    <div className="flex items-start gap-3">
                      <dt className="w-16 shrink-0 pt-0.5 text-[11px] text-[var(--color-faint)]">Backups</dt>
                      <dd className="min-w-0">
                        <StatusSummary vazio="nenhum job" itens={backups} />
                      </dd>
                    </div>
                  </dl>
                </ItemMovel>
              ))}
            </ListaMovel>

            <SomenteDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Plano</Th>
                    <Th>Máquinas</Th>
                    <Th>Backups</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ cliente: c, maquinas, backups }) => (
                    <Tr key={c.id}>
                      <Td>
                        <Link
                          href={`/clientes/${c.id}`}
                          className="font-medium text-[var(--color-fg)] hover:text-[var(--color-info)]"
                        >
                          {c.name}
                        </Link>
                        {c.contactEmail && (
                          <p className="text-xs text-[var(--color-faint)]">{c.contactEmail}</p>
                        )}
                      </Td>
                      <Td className="text-[var(--color-muted)]">{PLANO_LABEL[c.plan]}</Td>
                      <Td>
                        <StatusSummary vazio="nenhuma máquina" itens={maquinas} />
                      </Td>
                      <Td>
                        <StatusSummary vazio="nenhum job" itens={backups} />
                      </Td>
                      <Td>
                        <Badge tone={c.active ? "ok" : "neutral"}>
                          {c.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </SomenteDesktop>
          </>
        )}
      </Card>
    </div>
  );
}
