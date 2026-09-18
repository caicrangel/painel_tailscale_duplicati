import Link from "next/link";
import {
  Server,
  ServerOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import {
  carregarFaixas,
  carregarProblemas,
  carregarResumo,
  carregarSaudeDoWorker,
} from "@/lib/dashboard/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatTile, HeroNumber } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { HeatStrip, HeatStripLegenda } from "@/components/heat-strip";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import { ALERT_SEVERITY, ALERT_TYPE, JOB_STATUS } from "@/lib/utils/status";
import { fmtDataHora, fmtRelativo } from "@/lib/utils/format";

export const metadata = { title: "Dashboard · Painel" };
export const dynamic = "force-dynamic";

/** Ciclo do worker parado há mais que isto é sinal de monitoramento cego. */
const LIMITE_CICLO_MIN = 15;

export default async function DashboardPage() {
  await requireUser();

  const [resumo, problemas, saude] = await Promise.all([
    carregarResumo(),
    carregarProblemas(12),
    carregarSaudeDoWorker(),
  ]);

  const jobsCriticos = await prisma.backupJob.findMany({
    where: { active: true },
    orderBy: [{ status: "asc" }, { lastRunAt: "asc" }],
    take: 12,
    include: {
      machine: {
        select: { id: true, hostname: true, displayName: true, client: { select: { name: true } } },
      },
    },
  });

  const faixas = await carregarFaixas(jobsCriticos.map((j) => j.id), 14);

  const agora = new Date();
  const cicloVelho = saude.find(
    (c) => agora.getTime() - c.startedAt.getTime() > LIMITE_CICLO_MIN * 60_000,
  );
  const cicloComErro = saude.find((c) => !c.ok);

  const problemasCriticos = resumo.alertas.criticos;
  const tudoCalmo = resumo.alertas.abertos === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${resumo.clientes.ativos} cliente(s) ativo(s) · ${resumo.maquinas.total} máquina(s) · ${resumo.jobs.total} job(s) de backup`}
      />

      {(cicloVelho || cicloComErro) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] px-4 py-3 text-sm text-[var(--color-warn)]">
          <Activity className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">O monitoramento pode estar cego.</p>
            <p className="mt-0.5 text-[var(--color-muted)]">
              {cicloVelho
                ? `O ciclo ${cicloVelho.kind} não roda desde ${fmtDataHora(cicloVelho.startedAt)}.`
                : `O último ciclo ${cicloComErro?.kind} falhou: ${cicloComErro?.error ?? "erro desconhecido"}.`}{" "}
              Verifique o container do worker antes de confiar nos números abaixo.
            </p>
          </div>
        </div>
      )}

      {/* O número que o dashboard lidera: o que exige ação agora. */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-6">
          <HeroNumber
            value={resumo.jobs.atrasados + resumo.jobs.erro}
            label="Backups precisando de atenção"
            tone={resumo.jobs.atrasados + resumo.jobs.erro > 0 ? "danger" : "ok"}
            sub={
              resumo.jobs.atrasados + resumo.jobs.erro > 0
                ? `${resumo.jobs.atrasados} atrasado(s) e ${resumo.jobs.erro} com erro`
                : "Nenhum job com erro ou atraso neste momento."
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            {problemasCriticos > 0 && (
              <Badge tone="danger" dot>
                {problemasCriticos} alerta(s) crítico(s) aberto(s)
              </Badge>
            )}
            {resumo.maquinas.naoAtribuidas > 0 && (
              <Link href="/maquinas?cliente=nao-atribuidas">
                <Badge tone="warn">
                  {resumo.maquinas.naoAtribuidas} máquina(s) não atribuída(s)
                </Badge>
              </Link>
            )}
            {tudoCalmo && <Badge tone="ok" dot>Nenhum alerta aberto</Badge>}
          </div>
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Máquinas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Online"
            value={resumo.maquinas.online}
            tone="ok"
            icon={<Server className="size-3.5" />}
            href="/maquinas?status=ONLINE"
            hint="contato há menos de 5 min"
          />
          <StatTile
            label="Ociosas"
            value={resumo.maquinas.idle}
            tone="idle"
            icon={<Clock className="size-3.5" />}
            href="/maquinas?status=IDLE"
            hint="entre 5 e 60 min sem contato"
          />
          <StatTile
            label="Offline"
            value={resumo.maquinas.offline}
            tone="danger"
            icon={<ServerOff className="size-3.5" />}
            href="/maquinas?status=OFFLINE"
            hint="mais de 60 min sem contato"
            destaque
          />
          <StatTile
            label="Sem informação"
            value={resumo.maquinas.desconhecidas}
            tone="neutral"
            icon={<Activity className="size-3.5" />}
            href="/maquinas?status=UNKNOWN"
            hint="nunca vistas pelo Tailscale"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Jobs de backup
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="OK"
            value={resumo.jobs.ok}
            tone="ok"
            icon={<CheckCircle2 className="size-3.5" />}
            href="/jobs?status=OK"
          />
          <StatTile
            label="Warning"
            value={resumo.jobs.warning}
            tone="warn"
            icon={<AlertTriangle className="size-3.5" />}
            href="/jobs?status=WARNING"
          />
          <StatTile
            label="Erro"
            value={resumo.jobs.erro}
            tone="danger"
            icon={<XCircle className="size-3.5" />}
            href="/jobs?status=ERROR"
            destaque
          />
          <StatTile
            label="Atrasados"
            value={resumo.jobs.atrasados}
            tone="late"
            icon={<Clock className="size-3.5" />}
            href="/jobs?status=LATE"
            hint="deveriam ter rodado e não rodaram"
            destaque
          />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Problemas abertos</CardTitle>
            <Link href="/alertas" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-info)]">
              ver todos
            </Link>
          </CardHeader>
          {problemas.length === 0 ? (
            <EmptyState
              title="Nenhum problema aberto"
              hint="Máquinas respondendo e backups em dia. Os alertas aparecem aqui assim que algo sair do lugar."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]/60">
              {problemas.map((alerta) => (
                <li key={alerta.id} className="flex items-start gap-3 px-4 py-3">
                  <Badge tone={ALERT_SEVERITY[alerta.severity].tone} dot>
                    {ALERT_SEVERITY[alerta.severity].label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alerta.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {ALERT_TYPE[alerta.type].label}
                      {alerta.client && ` · ${alerta.client.name}`} · aberto{" "}
                      {fmtRelativo(alerta.openedAt)}
                    </p>
                  </div>
                  {alerta.backupJob && (
                    <Link
                      href={`/jobs/${alerta.backupJob.id}`}
                      className="shrink-0 text-xs text-[var(--color-info)]"
                    >
                      abrir
                    </Link>
                  )}
                  {!alerta.backupJob && alerta.machine && (
                    <Link
                      href={`/maquinas/${alerta.machine.id}`}
                      className="shrink-0 text-xs text-[var(--color-info)]"
                    >
                      abrir
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos 14 dias por job</CardTitle>
            <Link href="/jobs" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-info)]">
              ver todos
            </Link>
          </CardHeader>
          {jobsCriticos.length === 0 ? (
            <EmptyState
              title="Nenhum job reportou ainda"
              hint="Configure o --send-http-url de um job do Duplicati para ele aparecer aqui."
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th className="w-px whitespace-nowrap">14 dias</Th>
                  </tr>
                </thead>
                <tbody>
                  {jobsCriticos.map((job) => (
                    <Tr key={job.id}>
                      <Td className="max-w-[15rem]">
                        <Link href={`/jobs/${job.id}`} className="block truncate font-medium hover:text-[var(--color-info)]">
                          {job.name}
                        </Link>
                        <p className="truncate text-xs text-[var(--color-faint)]">
                          {job.machine.displayName ?? job.machine.hostname}
                          {job.machine.client && ` · ${job.machine.client.name}`}
                        </p>
                      </Td>
                      <Td>
                        <Badge tone={JOB_STATUS[job.status].tone} dot>
                          {JOB_STATUS[job.status].label}
                        </Badge>
                      </Td>
                      <Td className="w-px whitespace-nowrap">
                        <HeatStrip dias={faixas.get(job.id) ?? []} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <div className="border-t border-[var(--color-border)] px-4 py-3">
                <HeatStripLegenda />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
