import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/guards";
import { env } from "@/lib/config/env";
import { cicloAtrasado } from "@/lib/dashboard/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr, EmptyState } from "@/components/ui/table";
import {
  fmtBytes,
  fmtDataHora,
  fmtNumero,
  fmtRelativo,
} from "@/lib/utils/format";
import { diagnosticarSaude, type NivelSaude } from "@/lib/sistema/saude";
import {
  CATEGORIAS_AUDITORIA,
  JANELA_FALHAS_NOTIFICACAO_DIAS,
  POR_PAGINA_AUDITORIA,
  descreverAcao,
  filtroAuditoriaSchema,
} from "@/lib/sistema/auditoria";
import { FilterBar } from "@/components/filter-bar";
import Link from "next/link";
import { ReenviarButton } from "./reenviar-button";

export const metadata = { title: "Sistema · Configurações" };
export const dynamic = "force-dynamic";

const ROTULO_CICLO: Record<string, string> = {
  TAILSCALE: "Sincronização com o Tailscale",
  LATE_CHECK: "Detecção de atraso",
  ALERTS: "Avaliação de alertas",
  NOTIFY: "Fila de notificação",
  MAINTENANCE: "Manutenção",
  RESUMO: "Resumo periódico",
};

type SondaBanco = {
  ok: boolean;
  latenciaMs: number | null;
  versao: string | null;
  tamanhoBytes: bigint | null;
  conexoes: number | null;
  maxConexoes: number | null;
};

async function sondarBanco(): Promise<SondaBanco> {
  const inicio = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latenciaMs = Math.round(performance.now() - inicio);
    const [info] = await prisma.$queryRaw<
      {
        versao: string;
        tamanho: bigint;
        conexoes: bigint;
        max_conexoes: string;
      }[]
    >`SELECT current_setting('server_version') AS versao,
             pg_database_size(current_database()) AS tamanho,
             (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conexoes,
             current_setting('max_connections') AS max_conexoes`;
    return {
      ok: true,
      latenciaMs,
      versao: info?.versao ?? null,
      tamanhoBytes: info?.tamanho ?? null,
      conexoes: info ? Number(info.conexoes) : null,
      maxConexoes: info ? Number(info.max_conexoes) : null,
    };
  } catch {
    return {
      ok: false,
      latenciaMs: null,
      versao: null,
      tamanhoBytes: null,
      conexoes: null,
      maxConexoes: null,
    };
  }
}

function fmtUptime(segundos: number): string {
  const d = Math.floor(segundos / 86_400);
  const h = Math.floor((segundos % 86_400) / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const BANNER: Record<
  NivelSaude,
  { titulo: string; tone: "ok" | "warn" | "danger"; classe: string }
> = {
  ok: {
    titulo: "Sistema operando normalmente",
    tone: "ok",
    classe:
      "border-[var(--color-ok)]/30 bg-[var(--color-ok-dim)] text-[var(--color-ok)]",
  },
  atencao: {
    titulo: "Sistema operando, com pontos de atenção",
    tone: "warn",
    classe:
      "border-[var(--color-warn)]/30 bg-[var(--color-warn-dim)] text-[var(--color-warn)]",
  },
  falha: {
    titulo: "Sistema com falha",
    tone: "danger",
    classe:
      "border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] text-[var(--color-danger)]",
  },
};

const ROTULO_CANAL: Record<string, string> = {
  telegram: "Telegram",
  email: "E-mail",
};

export default async function SistemaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("ADMIN");
  const e = env();
  const filtro = filtroAuditoriaSchema.parse(await searchParams);

  const banco = await sondarBanco();
  if (!banco.ok) {
    const b = BANNER.falha;
    return (
      <div className={`rounded-lg border px-4 py-3 ${b.classe}`}>
        <p className="font-semibold">{b.titulo}</p>
        <p className="mt-1 text-sm">
          O banco de dados não respondeu. Verifique o container do postgres.
        </p>
      </div>
    );
  }

  const desdeFalhas = new Date(
    Date.now() - JANELA_FALHAS_NOTIFICACAO_DIAS * 24 * 60 * 60_000,
  );
  const whereFalhas = {
    status: "FAILED" as const,
    createdAt: { gte: desdeFalhas },
  };
  const whereAuditoria = filtro.categoria
    ? { action: { startsWith: `${filtro.categoria}.` } }
    : {};

  const [
    ciclos,
    contagens,
    notificacoesFalhas,
    falhasRecentes,
    eventos,
    totalEventos,
  ] = await Promise.all([
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
    prisma.alertNotification.count({ where: whereFalhas }),
    prisma.alertNotification.findMany({
      where: whereFalhas,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        channel: true,
        kind: true,
        createdAt: true,
        lastError: true,
        alert: { select: { id: true, title: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: whereAuditoria,
      orderBy: { createdAt: "desc" },
      skip: (filtro.pagina - 1) * POR_PAGINA_AUDITORIA,
      take: POR_PAGINA_AUDITORIA,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        userEmail: true,
        ip: true,
        metadata: true,
        user: { select: { name: true } },
      },
    }),
    prisma.auditLog.count({ where: whereAuditoria }),
  ]);

  const [clientes, maquinas, jobs, execucoes, alertasAbertos] = contagens;
  const agora = new Date();
  const tailscaleConfigurado = Boolean(
    e.TAILSCALE_OAUTH_CLIENT_ID && e.TAILSCALE_OAUTH_CLIENT_SECRET,
  );
  const usoConexoes =
    banco.conexoes !== null && banco.maxConexoes
      ? banco.conexoes / banco.maxConexoes
      : null;

  const diagnostico = diagnosticarSaude({
    banco: { ok: banco.ok, latenciaMs: banco.latenciaMs, usoConexoes },
    ciclos: ciclos
      .filter((c) => c.kind in ROTULO_CICLO)
      .map((c) => ({
        kind: c.kind,
        ok: c.ok,
        atrasado: cicloAtrasado(c.kind, c.startedAt, agora),
      })),
    tailscaleConfigurado,
    notificacoesFalhas,
  });
  const banner = BANNER[diagnostico.nivel];
  const memoria = process.memoryUsage().rss;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div
        className={`min-w-0 rounded-lg border px-4 py-3 lg:col-span-3 ${banner.classe}`}
      >
        <p className="font-semibold">{banner.titulo}</p>
        {diagnostico.problemas.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {diagnostico.problemas.map((p) => (
              <li key={p.texto}>{p.texto}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm">
            Banco respondendo, todos os ciclos do worker em dia e integrações
            configuradas.
          </p>
        )}
      </div>

      <Card className="min-w-0 lg:col-span-2">
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
                      <p className="font-medium">
                        {ROTULO_CICLO[c.kind] ?? c.kind}
                      </p>
                      <p className="font-mono text-xs text-[var(--color-faint)]">
                        {c.kind}
                      </p>
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
                      {c.itemsProcessed === null
                        ? "—"
                        : fmtNumero(c.itemsProcessed)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Banco de dados</CardTitle>
            <Badge tone="ok" dot>
              no ar
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Linha
              rotulo="Tempo de resposta"
              valor={`${banco.latenciaMs ?? "—"} ms`}
            />
            <Linha rotulo="Versão do PostgreSQL" valor={banco.versao ?? "—"} />
            <Linha
              rotulo="Tamanho do banco"
              valor={fmtBytes(banco.tamanhoBytes)}
            />
            <Linha
              rotulo="Conexões em uso"
              valor={
                banco.conexoes === null
                  ? "—"
                  : `${banco.conexoes} de ${banco.maxConexoes ?? "?"}`
              }
            />
          </CardBody>
        </Card>

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
              As credenciais do Tailscale continuam vindo só de variável de
              ambiente (<code className="font-mono">TAILSCALE_OAUTH_*</code>),
              por serem credenciais de infraestrutura e não configuração de
              operação.
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aplicação</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Linha rotulo="No ar há" valor={fmtUptime(process.uptime())} />
            <Linha rotulo="Node.js" valor={process.version} />
            <Linha rotulo="Memória em uso" valor={fmtBytes(memoria)} />
            <Linha rotulo="Fuso horário" valor={e.TZ} />
            <Linha rotulo="URL base" valor={e.APP_BASE_URL} />
            <Linha
              rotulo="Cookie seguro"
              valor={e.AUTH_COOKIE_SECURE ? "sim" : "não (HTTP)"}
            />
          </CardBody>
        </Card>
      </div>

      {falhasRecentes.length > 0 && (
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>
              Notificações não entregues (últimos{" "}
              {JANELA_FALHAS_NOTIFICACAO_DIAS} dias)
            </CardTitle>
            <ReenviarButton />
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              O painel tentou 5 vezes e desistiu. Os incidentes continuam
              registrados; só o aviso não chegou. Corrija o canal e use
              &quot;Reenviar&quot; para tentar de novo.
            </p>
            <ul className="divide-y divide-[var(--color-border)]">
              {falhasRecentes.map((n) => (
                <li key={n.id} className="min-w-0 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href="/alertas"
                      className="min-w-0 truncate font-medium text-[var(--color-info)]"
                    >
                      {n.kind === "RECOVERY" ? "Recuperação — " : ""}
                      {n.alert.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[var(--color-faint)]">
                      {ROTULO_CANAL[n.channel] ?? n.channel} ·{" "}
                      {fmtDataHora(n.createdAt)}
                    </span>
                  </div>
                  {n.lastError && (
                    <p className="mt-1 break-words font-mono text-xs text-[var(--color-danger)]">
                      {n.lastError}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card className="min-w-0 lg:col-span-3">
        <CardHeader>
          <CardTitle>Log de auditoria</CardTitle>
          <span className="text-xs text-[var(--color-muted)]">
            {fmtNumero(totalEventos)} evento(s)
          </span>
        </CardHeader>
        <CardBody>
          <FilterBar
            filtros={[
              {
                name: "categoria",
                label: "Categoria",
                valor: filtro.categoria ?? "",
                opcoes: [
                  { value: "", label: "Todas" },
                  ...Object.entries(CATEGORIAS_AUDITORIA).map(
                    ([value, label]) => ({
                      value,
                      label,
                    }),
                  ),
                ],
              },
            ]}
          />
          {eventos.length === 0 ? (
            <EmptyState
              title="Nenhum evento registrado"
              hint="Logins, alterações e testes aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {eventos.map((ev) => {
                const d = descreverAcao(ev.action);
                const quem = ev.user?.name ?? ev.userEmail ?? "sistema";
                const detalhe = ev.metadata
                  ? JSON.stringify(ev.metadata)
                  : null;
                return (
                  <li
                    key={ev.id}
                    className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[9rem_1fr_auto] sm:gap-4"
                  >
                    <span className="text-xs text-[var(--color-faint)] sm:pt-0.5">
                      {fmtDataHora(ev.createdAt)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {d.tom === "neutral" ? (
                          d.rotulo
                        ) : (
                          <Badge tone={d.tom} dot>
                            {d.rotulo}
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {quem}
                        {ev.userEmail && ev.user?.name
                          ? ` (${ev.userEmail})`
                          : ""}
                        {ev.ip ? ` · IP ${ev.ip}` : ""}
                        {ev.entityType ? ` · ${ev.entityType}` : ""}
                      </p>
                      {detalhe && detalhe !== "{}" && (
                        <p
                          className="truncate font-mono text-xs text-[var(--color-faint)]"
                          title={detalhe}
                        >
                          {detalhe}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-[var(--color-faint)] sm:text-right">
                      {d.categoria}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Paginacao
            pagina={filtro.pagina}
            temMais={filtro.pagina * POR_PAGINA_AUDITORIA < totalEventos}
            categoria={filtro.categoria}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Paginacao({
  pagina,
  temMais,
  categoria,
}: {
  pagina: number;
  temMais: boolean;
  categoria?: string;
}) {
  if (pagina === 1 && !temMais) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (categoria) q.set("categoria", categoria);
    if (p > 1) q.set("pagina", String(p));
    const qs = q.toString();
    return `/configuracoes/sistema${qs ? `?${qs}` : ""}`;
  };
  const cls =
    "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs";
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      {pagina > 1 ? (
        <Link className={cls} href={href(pagina - 1)}>
          ← Mais recentes
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-[var(--color-faint)]">Página {pagina}</span>
      {temMais ? (
        <Link className={cls} href={href(pagina + 1)}>
          Mais antigos →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--color-muted)]">{rotulo}</span>
      <span className="truncate font-mono text-xs text-[var(--color-fg)]">
        {valor}
      </span>
    </div>
  );
}
