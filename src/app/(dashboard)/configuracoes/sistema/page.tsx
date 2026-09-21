import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/guards";
import { env } from "@/lib/config/env";
import { cicloAtrasado } from "@/lib/dashboard/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { fmtDataHora, fmtNumero, fmtRelativo } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const ROTULO_CICLO: Record<string, string> = {
  TAILSCALE: "Sincronização com o Tailscale",
  LATE_CHECK: "Detecção de atraso",
  ALERTS: "Avaliação de alertas",
  NOTIFY: "Fila de notificação",
  MAINTENANCE: "Manutenção",
  RESUMO: "Resumo periódico",
};

export default async function SistemaPage() {
  await requireRole("ADMIN");
  const e = env();

  const [ciclos, contagens, notificacoesFalhas] = await Promise.all([
    prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      distinct: ["kind"],
      select: {
        kind: true,
        startedAt: true,
        finishedAt: true,
        ok: true,
        error: true,
        itemsProcessed: true,
      },
    }),
    Promise.all([
      prisma.client.count(),
      prisma.machine.count(),
      prisma.backupJob.count(),
      prisma.backupRun.count(),
      prisma.alert.count({ where: { closedAt: null } }),
    ]),
    prisma.alertNotification.count({ where: { status: "FAILED" } }),
  ]);

  const [clientes, maquinas, jobs, execucoes, alertasAbertos] = contagens;
  const agora = new Date();
  const tailscaleConfigurado = Boolean(e.TAILSCALE_OAUTH_CLIENT_ID && e.TAILSCALE_OAUTH_CLIENT_SECRET);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Ciclos do worker</CardTitle>
        </CardHeader>
        {ciclos.length === 0 ? (
          <EmptyState
            title="O worker ainda não registrou nenhum ciclo"
            hint="Se o container do worker está de pé, o primeiro registro aparece em poucos minutos."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ciclo</Th>
                <Th>Última execução</Th>
                <Th>Resultado</Th>
                <Th>Itens</Th>
              </tr>
            </thead>
            <tbody>
              {ciclos.map((c) => {
                const atrasado = cicloAtrasado(c.kind, c.startedAt, agora);
                return (
                  <Tr key={c.kind}>
                    <Td>
                      <p className="font-medium">{ROTULO_CICLO[c.kind] ?? c.kind}</p>
                      <p className="font-mono text-xs text-[var(--color-faint)]">{c.kind}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-[var(--color-muted)]">
                      {fmtRelativo(c.startedAt)}
                      <span className="block text-xs text-[var(--color-faint)]">
                        {fmtDataHora(c.startedAt)}
                      </span>
                    </Td>
                    <Td>
                      {!c.ok ? (
                        <Badge tone="danger" dot>
                          falhou
                        </Badge>
                      ) : atrasado ? (
                        <Badge tone="warn" dot>
                          parado
                        </Badge>
                      ) : (
                        <Badge tone="ok" dot>
                          ok
                        </Badge>
                      )}
                      {c.error && (
                        <p className="mt-1 max-w-md break-words font-mono text-xs text-[var(--color-danger)]">
                          {c.error}
                        </p>
                      )}
                    </Td>
                    <Td className="tabular-nums text-[var(--color-muted)]">
                      {c.itemsProcessed === null ? "—" : fmtNumero(c.itemsProcessed)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tailscale</CardTitle>
            <Badge tone={tailscaleConfigurado ? "ok" : "warn"} dot>
              {tailscaleConfigurado ? "configurado" : "não configurado"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Linha rotulo="Tailnet" valor={e.TAILSCALE_TAILNET} />
            <Linha rotulo="Domínio MagicDNS" valor={e.MAGICDNS_DOMAIN ?? "—"} />
            <p className="border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
              As credenciais do Tailscale continuam vindo só de variável de ambiente
              (<code className="font-mono">TAILSCALE_OAUTH_*</code>), por serem credenciais de
              infraestrutura e não configuração de operação.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Números do banco</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Linha rotulo="Clientes" valor={fmtNumero(clientes)} />
            <Linha rotulo="Máquinas" valor={fmtNumero(maquinas)} />
            <Linha rotulo="Jobs" valor={fmtNumero(jobs)} />
            <Linha rotulo="Execuções guardadas" valor={fmtNumero(execucoes)} />
            <Linha rotulo="Alertas abertos" valor={fmtNumero(alertasAbertos)} />
            {notificacoesFalhas > 0 && (
              <p className="mt-2 rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-3 py-2 text-xs text-[var(--color-warn)]">
                {notificacoesFalhas} notificação(ões) desistiram após as tentativas. Os incidentes
                continuam registrados no painel.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aplicação</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Linha rotulo="Fuso horário" valor={e.TZ} />
            <Linha rotulo="URL base" valor={e.APP_BASE_URL} />
            <Linha rotulo="Cookie seguro" valor={e.AUTH_COOKIE_SECURE ? "sim" : "não (HTTP)"} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--color-muted)]">{rotulo}</span>
      <span className="truncate font-mono text-xs text-[var(--color-fg)]">{valor}</span>
    </div>
  );
}
