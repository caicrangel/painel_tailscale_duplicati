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
import { MACHINE_STATUS } from "@/lib/utils/status";

export const metadata = { title: "Clientes · Painel" };
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
      machines: { select: { status: true } },
      _count: { select: { machines: true, ingestTokens: true } },
    },
  });

  return (
    <div>
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
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Plano</Th>
                <Th>Máquinas</Th>
                <Th>Online</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const online = c.machines.filter((m) => m.status === "ONLINE").length;
                const offline = c.machines.filter((m) => m.status === "OFFLINE").length;
                return (
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
                    <Td className="tabular-nums">{c._count.machines}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={MACHINE_STATUS.ONLINE.tone} dot>
                          {online}
                        </Badge>
                        {offline > 0 && (
                          <Badge tone={MACHINE_STATUS.OFFLINE.tone} dot>
                            {offline}
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={c.active ? "ok" : "neutral"}>
                        {c.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
