import { prisma } from "@/lib/db/prisma";
import type { DiaDaFaixa } from "@/components/heat-strip";
import { avaliarAtrasoMontagem } from "@/lib/mounts/late";

/**
 * Consultas do dashboard. Todas respondem em uma query — é para isso que os
 * campos denormalizados de BackupJob existem.
 */

const TZ = "America/Sao_Paulo";

export type ResumoDashboard = {
  maquinas: {
    total: number;
    online: number;
    idle: number;
    offline: number;
    desconhecidas: number;
    naoAtribuidas: number;
    /** Máquinas nossas, de apoio: ficam fora dos indicadores acima. */
    suporte: number;
  };
  jobs: { total: number; ok: number; warning: number; erro: number; atrasados: number; pausados: number; semDados: number };
  clientes: { total: number; ativos: number };
  alertas: { abertos: number; criticos: number };
};

export async function carregarResumo(): Promise<ResumoDashboard> {
  // Os indicadores respondem "como está a infraestrutura dos clientes", então
  // máquinas de apoio (as nossas) não entram na conta — um celular desligado
  // não pode pintar o painel de vermelho.
  const [maquinasPorStatus, naoAtribuidas, suporte, jobsPorStatus, clientes, clientesAtivos, alertas, criticos] =
    await Promise.all([
      prisma.machine.groupBy({ by: ["status"], _count: true, where: { role: "CLIENTE" } }),
      prisma.machine.count({ where: { clientId: null, role: "CLIENTE" } }),
      prisma.machine.count({ where: { role: "SUPORTE" } }),
      prisma.backupJob.groupBy({ by: ["status"], _count: true, where: { active: true } }),
      prisma.client.count(),
      prisma.client.count({ where: { active: true } }),
      prisma.alert.count({ where: { closedAt: null } }),
      prisma.alert.count({ where: { closedAt: null, severity: "CRITICAL" } }),
    ]);

  const m = (status: string) =>
    maquinasPorStatus.find((x) => x.status === status)?._count ?? 0;
  const j = (status: string) => jobsPorStatus.find((x) => x.status === status)?._count ?? 0;

  return {
    maquinas: {
      total: maquinasPorStatus.reduce((acc, x) => acc + x._count, 0),
      online: m("ONLINE"),
      idle: m("IDLE"),
      offline: m("OFFLINE"),
      desconhecidas: m("UNKNOWN"),
      naoAtribuidas,
      suporte,
    },
    jobs: {
      total: jobsPorStatus.reduce((acc, x) => acc + x._count, 0),
      ok: j("OK"),
      warning: j("WARNING"),
      erro: j("ERROR"),
      atrasados: j("LATE"),
      pausados: j("PAUSED"),
      semDados: j("UNKNOWN"),
    },
    clientes: { total: clientes, ativos: clientesAtivos },
    alertas: { abertos: alertas, criticos },
  };
}

/** Problemas abertos, ordenados por gravidade e depois por antiguidade. */
export async function carregarProblemas(limite = 25) {
  return prisma.alert.findMany({
    where: { closedAt: null },
    orderBy: [{ severity: "asc" }, { openedAt: "asc" }],
    take: limite,
    include: {
      client: { select: { id: true, name: true } },
      machine: { select: { id: true, hostname: true, displayName: true } },
      backupJob: { select: { id: true, name: true } },
    },
  });
}

type LinhaFaixa = { jobId: string; dia: Date; pior: string; execucoes: bigint };

/**
 * Pior resultado por dia, por job, nos últimos N dias — na timezone da operação.
 * "Pior" segue a ordem Fatal > Error > Warning > Success: um dia com uma falha
 * não pode parecer verde porque houve um sucesso depois.
 */
export async function carregarFaixas(
  jobIds: string[],
  dias = 14,
): Promise<Map<string, DiaDaFaixa[]>> {
  const mapa = new Map<string, DiaDaFaixa[]>();
  if (jobIds.length === 0) return mapa;

  const desde = new Date(Date.now() - (dias - 1) * 86_400_000);

  const linhas = await prisma.$queryRaw<LinhaFaixa[]>`
    SELECT
      "backupJobId" AS "jobId",
      date_trunc('day', "receivedAt" AT TIME ZONE ${TZ}) AS dia,
      MAX(
        CASE "parsedResult"
          WHEN 'FATAL' THEN 4
          WHEN 'ERROR' THEN 3
          WHEN 'WARNING' THEN 2
          WHEN 'SUCCESS' THEN 1
          ELSE 0 -- UNKNOWN: rodou, mas o relatório não foi interpretado
        END
      )::text AS pior,
      COUNT(*) AS execucoes
    FROM backup_runs
    WHERE "backupJobId" = ANY(${jobIds})
      AND "receivedAt" >= ${desde}
    GROUP BY 1, 2
  `;

  const porJob = new Map<string, Map<string, { pior: number; execucoes: number }>>();
  for (const linha of linhas) {
    const chaveDia = linha.dia.toISOString().slice(0, 10);
    const doJob = porJob.get(linha.jobId) ?? new Map();
    doJob.set(chaveDia, { pior: Number(linha.pior), execucoes: Number(linha.execucoes) });
    porJob.set(linha.jobId, doJob);
  }

  const hoje = new Date();
  for (const jobId of jobIds) {
    const doJob = porJob.get(jobId) ?? new Map<string, { pior: number; execucoes: number }>();
    const faixa: DiaDaFaixa[] = [];

    for (let i = dias - 1; i >= 0; i -= 1) {
      const data = new Date(hoje.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      const registro = doJob.get(data);
      faixa.push({
        data,
        resultado: registro ? traduzirPior(registro.pior) : "NENHUM",
        execucoes: registro?.execucoes ?? 0,
      });
    }

    mapa.set(jobId, faixa);
  }

  return mapa;
}

function traduzirPior(valor: number): DiaDaFaixa["resultado"] {
  switch (valor) {
    case 4:
      return "FATAL";
    case 3:
      return "ERROR";
    case 2:
      return "WARNING";
    case 1:
      return "SUCCESS";
    default:
      return "DESCONHECIDO";
  }
}

/**
 * Tolerância de atraso por tipo de ciclo. Um único limite para todos não
 * funciona: a manutenção roda de hora em hora e ficaria permanentemente
 * "atrasada", gerando um alarme falso que ensina o operador a ignorar o aviso.
 * Cada valor é folgado em relação à frequência real da tarefa.
 */
export const LIMITE_CICLO_MINUTOS: Record<string, number> = {
  TAILSCALE: 15, // roda a cada 2 min
  LATE_CHECK: 20, // a cada 5 min
  ALERTS: 15, // a cada 1 min
  NOTIFY: 15, // a cada 1 min
  MAINTENANCE: 180, // a cada 1 hora
  RESUMO: 15, // avaliado a cada 1 min
};

/** Ciclo desconhecido (kind novo) usa este limite. */
export const LIMITE_CICLO_PADRAO = 60;

export function cicloAtrasado(kind: string, startedAt: Date, agora: Date): boolean {
  const limite = LIMITE_CICLO_MINUTOS[kind] ?? LIMITE_CICLO_PADRAO;
  return agora.getTime() - startedAt.getTime() > limite * 60_000;
}

/** Saúde do próprio monitoramento: sem isto, "tudo verde" pode ser worker morto. */
export async function carregarSaudeDoWorker() {
  const ciclos = await prisma.syncLog.findMany({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    distinct: ["kind"],
    select: { kind: true, startedAt: true, finishedAt: true, ok: true, error: true },
  });
  return ciclos;
}

export type PontoDoPanorama = {
  id: string;
  path: string;
  status: "OK" | "REMOUNTED" | "FAILED" | "UNKNOWN";
  detail: string | null;
  usePercent: string | null;
  available: string | null;
};

export type MontagemDaMaquina = {
  machineId: string;
  nome: string;
  cliente: string | null;
  resultado: "OK" | "RECOVERED" | "FAILED" | "UNKNOWN";
  /** A verificação parou de chegar dentro do intervalo configurado. */
  parada: boolean;
  vigiada: boolean;
  recebidaEm: Date;
  pontos: PontoDoPanorama[];
};

export type PanoramaMontagens = {
  maquinas: MontagemDaMaquina[];
  resumo: { ok: number; recuperadas: number; comFalha: number; paradas: number; pontos: number };
  /** Máquinas de cliente que nunca reportaram — o script não foi instalado. */
  semReporte: number;
};

/**
 * Panorama de montagens para o dashboard.
 *
 * Mostra a última verificação de cada máquina com os pontos abertos: é o que
 * permite ver, num relance, qual share de qual cliente está fora. A ordenação
 * coloca o que exige ação na frente — falha, depois verificação parada.
 */
export async function carregarPanoramaMontagens(
  agora: Date = new Date(),
): Promise<PanoramaMontagens> {
  const [maquinas, semReporte] = await Promise.all([
    prisma.machine.findMany({
      where: { role: "CLIENTE", clientId: { not: null }, lastMountCheckAt: { not: null } },
      select: {
        id: true,
        hostname: true,
        displayName: true,
        mountCheckIntervalMinutes: true,
        mountCheckToleranceMinutes: true,
        client: { select: { name: true } },
        mountChecks: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: {
            result: true,
            receivedAt: true,
            points: {
              select: {
                id: true,
                path: true,
                status: true,
                detail: true,
                usePercent: true,
                available: true,
              },
            },
          },
        },
      },
    }),
    prisma.machine.count({
      where: { role: "CLIENTE", clientId: { not: null }, lastMountCheckAt: null },
    }),
  ]);

  const linhas: MontagemDaMaquina[] = [];

  for (const maquina of maquinas) {
    const ultima = maquina.mountChecks[0];
    if (!ultima) continue;

    const { atrasada } = avaliarAtrasoMontagem({
      ultimaEm: ultima.receivedAt,
      intervaloMinutos: maquina.mountCheckIntervalMinutes,
      toleranciaMinutos: maquina.mountCheckToleranceMinutes,
      now: agora,
    });

    linhas.push({
      machineId: maquina.id,
      nome: maquina.displayName ?? maquina.hostname,
      cliente: maquina.client?.name ?? null,
      resultado: ultima.result,
      parada: atrasada,
      vigiada: maquina.mountCheckIntervalMinutes !== null,
      recebidaEm: ultima.receivedAt,
      pontos: ultima.points,
    });
  }

  linhas.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    maquinas: linhas,
    resumo: {
      ok: linhas.filter((l) => l.resultado === "OK" && !l.parada).length,
      recuperadas: linhas.filter((l) => l.resultado === "RECOVERED" && !l.parada).length,
      comFalha: linhas.filter((l) => l.resultado === "FAILED").length,
      paradas: linhas.filter((l) => l.parada && l.resultado !== "FAILED").length,
      pontos: linhas.reduce((acc, l) => acc + l.pontos.length, 0),
    },
    semReporte,
  };
}

/** Falha primeiro, depois verificação parada: é a ordem em que se age. */
function peso(linha: MontagemDaMaquina): number {
  if (linha.resultado === "FAILED") return 0;
  if (linha.parada) return 1;
  if (linha.resultado === "RECOVERED") return 2;
  if (linha.resultado === "UNKNOWN") return 3;
  return 4;
}
