import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { fmtDataHora } from "@/lib/utils/format";
import { LinhaUsuario, NovoUsuarioForm } from "./user-forms";

export const metadata = { title: "Usuários · Painel" };
export const dynamic = "force-dynamic";

const TOM_PAPEL = { ADMIN: "danger", OPERATOR: "info", VIEWER: "neutral" } as const;

export default async function UsuariosPage() {
  const atual = await requireRole("ADMIN");

  const [usuarios, auditoria] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle="Acesso restrito ao administrador. Não existe cadastro público."
        actions={<NovoUsuarioForm />}
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Papel</Th>
              <Th>Situação</Th>
              <Th>Último login</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <p className="font-medium">
                    {u.name}
                    {u.id === atual.id && (
                      <span className="ml-2 text-xs text-[var(--color-faint)]">(você)</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-faint)]">{u.email}</p>
                </Td>
                <Td>
                  <Badge tone={TOM_PAPEL[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                </Td>
                <Td>
                  <Badge tone={u.active ? "ok" : "neutral"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                </Td>
                <Td className="text-[var(--color-muted)]">{fmtDataHora(u.lastLoginAt)}</Td>
                <Td>
                  <LinhaUsuario usuario={u} souEu={u.id === atual.id} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria recente</CardTitle>
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>Ação</Th>
              <Th>Entidade</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {auditoria.map((log) => (
              <Tr key={log.id}>
                <Td className="whitespace-nowrap text-[var(--color-muted)]">
                  {fmtDataHora(log.createdAt)}
                </Td>
                <Td className="text-[var(--color-muted)]">{log.userEmail ?? "—"}</Td>
                <Td>
                  <code className="font-mono text-xs">{log.action}</code>
                </Td>
                <Td className="text-xs text-[var(--color-faint)]">
                  {log.entityType ? `${log.entityType}` : "—"}
                </Td>
                <Td className="text-xs text-[var(--color-faint)]">{log.ip ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
