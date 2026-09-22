import type { AlertSeverity, AlertType, JobStatus, MachineStatus } from "@prisma/client";
import { minutosOffline } from "@/lib/jobs/late";
import { avaliarAtrasoMontagem } from "@/lib/mounts/late";

/**
 * Motor de alertas — lógica pura (regra 5 do CLAUDE.md).
 *
 * Resolve dois problemas que, mal feitos, tornam o sistema inútil:
 *
 * 1. DEDUPLICAÇÃO — um incidente gera UM alerta, não um a cada ciclo do worker.
 *    A chave (dedupeKey) é estável por incidente; o banco reforça com índice
 *    único parcial em (dedupeKey) WHERE closedAt IS NULL.
 *
 * 2. CORRELAÇÃO — quando a máquina está offline, os jobs dela obviamente não
 *    rodaram. Emitir um alerta por job transformaria um servidor desligado numa
 *    enxurrada de mensagens. O atraso desses jobs entra como causa dentro do
 *    alerta de máquina offline.
 */

export type MaquinaSnapshot = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  /** Máquina nossa, de apoio: aparece na lista, mas não vira incidente. */
  suporte: boolean;
  hostname: string;
  displayName: string | null;
  status: MachineStatus;
  lastSeen: Date | null;
  maintenanceUntil: Date | null;
  /** Verificação de montagens, quando esta máquina reporta uma. */
  montagem: MontagemSnapshot | null;
};

export type MontagemSnapshot = {
  ultimaEm: Date | null;
  resultado: "OK" | "RECOVERED" | "FAILED" | "UNKNOWN" | null;
  pontosComFalha: number;
  /** Caminhos que o script encontrou fora e conseguiu remontar. */
  pontosRemontados: string[];
  /**
   * Quantas verificações desta máquina terminaram em remontagem na janela de
   * recorrência. Um share que volta sozinho toda noite não é incidente isolado
   * — é o servidor de arquivos ou a rede pedindo atenção, e só o histórico diz
   * isso. Por isso o número entra na mensagem em vez de ficar só na tela.
   */
  remontagensRecentes: number;
  /** Nulo = não vigiar atraso desta verificação. */
  intervaloMinutos: number | null;
  toleranciaMinutos: number;
};

export type JobSnapshot = {
  id: string;
  machineId: string;
  name: string;
  status: JobStatus;
  lastRunAt: Date | null;
  nextExpectedAt: Date | null;
  lateByMinutes: number;
  errorsCount: number;
  lastRunId: string | null;
};

export type Condicao = {
  dedupeKey: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  clientId: string | null;
  machineId: string | null;
  backupJobId: string | null;
  backupRunId: string | null;
  relatedJobIds: string[];
  context: Record<string, unknown>;
};

export type AlertaAberto = {
  id: string;
  dedupeKey: string;
  type: AlertType;
  relatedJobIds: string[];
};

export type PlanoDeAlertas = {
  abrir: Condicao[];
  /** Alerta já aberto que continua valendo — atualiza o contexto, não notifica de novo. */
  manter: { alerta: AlertaAberto; condicao: Condicao }[];
  /** Incidente resolvido: fecha e manda mensagem de recuperação. */
  fechar: AlertaAberto[];
};

// ─── Chaves de deduplicação ──────────────────────────────────────────────────

export const chaveMaquinaOffline = (machineId: string) => `machine_offline:machine:${machineId}`;
export const chaveJobAtrasado = (jobId: string) => `backup_late:job:${jobId}`;
export const chaveJobFalhou = (jobId: string) => `backup_failed:job:${jobId}`;
export const chaveJobWarning = (jobId: string) => `backup_warning:job:${jobId}`;
export const chaveMontagemFalhou = (machineId: string) => `mount_failed:machine:${machineId}`;
export const chaveMontagemRemontada = (machineId: string) =>
  `mount_remounted:machine:${machineId}`;
export const chaveMontagemParada = (machineId: string) => `mount_late:machine:${machineId}`;

// ─── Derivação das condições ─────────────────────────────────────────────────

function nomeMaquina(m: MaquinaSnapshot): string {
  return m.displayName ?? m.hostname;
}

function emManutencao(m: MaquinaSnapshot, now: Date): boolean {
  return m.maintenanceUntil !== null && m.maintenanceUntil.getTime() > now.getTime();
}

/** Janela do contador de remontagens que vai dentro do alerta. */
export const JANELA_REMONTAGENS_DIAS = 7;

/** Lista os caminhos sem deixar a mensagem virar um parágrafo. */
function listarCaminhos(paths: string[]): string {
  if (paths.length <= 3) return paths.join(", ");
  return `${paths.slice(0, 3).join(", ")} e mais ${paths.length - 3}`;
}

function descreverAtraso(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas}h`;
  return `${Math.floor(horas / 24)} dias`;
}

/**
 * Traduz o estado atual do parque em condições que merecem alerta.
 * Não toca no banco e não conhece alertas já abertos — isso é o passo seguinte.
 */
export function derivarCondicoes(params: {
  maquinas: MaquinaSnapshot[];
  jobs: JobSnapshot[];
  now: Date;
  offlineAlertMinutes: number;
  alertOnWarning: boolean;
}): Condicao[] {
  const { maquinas, jobs, now, offlineAlertMinutes, alertOnWarning } = params;
  const condicoes: Condicao[] = [];

  const jobsPorMaquina = new Map<string, JobSnapshot[]>();
  for (const job of jobs) {
    const lista = jobsPorMaquina.get(job.machineId) ?? [];
    lista.push(job);
    jobsPorMaquina.set(job.machineId, lista);
  }

  /** Máquinas cujo alerta de offline absorve o atraso dos jobs. */
  const maquinasAbsorvendo = new Set<string>();

  for (const maquina of maquinas) {
    // O gatilho é o tempo sem contato, NÃO a classificação de status.
    //
    // Antes isto exigia status === "OFFLINE", que só acontece depois do limite
    // de "ociosa" (60 min por padrão). Na prática, baixar "alertar offline após"
    // para 15 min não tinha efeito nenhum: a máquina ainda estava "ociosa" e o
    // alerta esperava os 60. Os dois botões pareciam independentes e não eram.
    // Agora "alertar offline após X minutos" significa exatamente isso.
    if (maquina.status === "UNKNOWN") continue;
    if (emManutencao(maquina, now)) continue;
    // Máquina de apoio não é infraestrutura de cliente: um notebook fechado à
    // noite não é incidente de backup.
    if (maquina.suporte) continue;
    // Máquina não atribuída não tem dono para avisar — aparece na UI, não no Telegram.
    if (maquina.clientId === null) continue;

    const minutos = minutosOffline(maquina.lastSeen, now);
    if (minutos === null || minutos < offlineAlertMinutes) continue;

    const jobsDaMaquina = jobsPorMaquina.get(maquina.id) ?? [];
    const atrasados = jobsDaMaquina.filter((j) => j.status === "LATE");

    maquinasAbsorvendo.add(maquina.id);

    condicoes.push({
      dedupeKey: chaveMaquinaOffline(maquina.id),
      type: "MACHINE_OFFLINE",
      severity: atrasados.length > 0 ? "CRITICAL" : "WARNING",
      title: `${nomeMaquina(maquina)} está offline`,
      message:
        `A máquina ${nomeMaquina(maquina)}${maquina.clientName ? ` (${maquina.clientName})` : ""} ` +
        `está sem contato há ${descreverAtraso(minutos)}.` +
        (atrasados.length > 0
          ? ` ${atrasados.length} job(s) de backup deixaram de rodar por causa disso: ` +
            `${atrasados.map((j) => j.name).join(", ")}.`
          : ""),
      clientId: maquina.clientId,
      machineId: maquina.id,
      backupJobId: null,
      backupRunId: null,
      relatedJobIds: atrasados.map((j) => j.id),
      context: { minutosOffline: minutos, jobsAtrasados: atrasados.length },
    });
  }

  for (const maquina of maquinas) {
    const montagem = maquina.montagem;
    if (!montagem) continue;
    if (maquina.suporte) continue;
    if (maquina.clientId === null) continue;
    if (emManutencao(maquina, now)) continue;
    // Máquina offline já explica a ausência da verificação: o alerta dela
    // absorve, como faz com os jobs atrasados.
    if (maquinasAbsorvendo.has(maquina.id)) continue;

    if (montagem.resultado === "FAILED") {
      condicoes.push({
        dedupeKey: chaveMontagemFalhou(maquina.id),
        type: "MOUNT_FAILED",
        severity: "CRITICAL",
        title: `Montagem com falha em ${nomeMaquina(maquina)}`,
        message:
          `A verificação de montagens de ${nomeMaquina(maquina)}` +
          `${maquina.clientName ? ` (${maquina.clientName})` : ""} apontou ` +
          `${montagem.pontosComFalha} ponto(s) com problema. ` +
          "O backup desta máquina não deve rodar até isso ser resolvido — " +
          "com o share fora, ele terminaria \"com sucesso\" sem copiar nada.",
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: null,
        backupRunId: null,
        relatedJobIds: [],
        context: { pontosComFalha: montagem.pontosComFalha },
      });
      continue;
    }

    // Remontagem bem-sucedida: o script consertou, então o backup está
    // protegido — mas o share caiu, e isso é o aviso que vem antes do
    // MOUNT_FAILED. Sem este alerta a queda fica só no histórico, e um ponto
    // que cai toda noite passa despercebido até o dia em que não volta.
    if (montagem.resultado === "RECOVERED") {
      const quantos = montagem.pontosRemontados.length;
      const recorrente = montagem.remontagensRecentes > 1;

      condicoes.push({
        dedupeKey: chaveMontagemRemontada(maquina.id),
        type: "MOUNT_REMOUNTED",
        severity: "WARNING",
        title: `Ponto de montagem remontado em ${nomeMaquina(maquina)}`,
        message:
          `A verificação de montagens de ${nomeMaquina(maquina)}` +
          `${maquina.clientName ? ` (${maquina.clientName})` : ""} encontrou ` +
          `${
            quantos > 0
              ? `${quantos} ponto${quantos === 1 ? "" : "s"} fora e remontou: ` +
                listarCaminhos(montagem.pontosRemontados)
              : "ponto(s) fora e conseguiu remontar"
          }. ` +
          "O backup seguiu protegido, mas o share saiu do ar — " +
          (recorrente
            ? `é a ${montagem.remontagensRecentes}ª remontagem desta máquina em ` +
              `${JANELA_REMONTAGENS_DIAS} dias. Queda que se repete costuma estar no ` +
              "servidor de arquivos ou na rede, não na máquina do cliente."
            : `foi a primeira remontagem em ${JANELA_REMONTAGENS_DIAS} dias. ` +
              "Se voltar a acontecer, vale olhar de onde vem o mapeamento."),
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: null,
        backupRunId: null,
        relatedJobIds: [],
        context: {
          pontosRemontados: montagem.pontosRemontados,
          remontagensRecentes: montagem.remontagensRecentes,
          janelaDias: JANELA_REMONTAGENS_DIAS,
        },
      });
      continue;
    }

    // Verificação que parou de chegar: mesmo princípio do backup atrasado.
    // Sem ela, o backup roda sem rede de proteção e ninguém percebe.
    const atraso = avaliarAtrasoMontagem({
      ultimaEm: montagem.ultimaEm,
      intervaloMinutos: montagem.intervaloMinutos,
      toleranciaMinutos: montagem.toleranciaMinutos,
      now,
    });

    if (atraso.atrasada) {
      const minutos = atraso.minutosSemVerificacao ?? 0;
      condicoes.push({
        dedupeKey: chaveMontagemParada(maquina.id),
        type: "MOUNT_LATE",
        severity: "WARNING",
        title: `Verificação de montagem parada em ${nomeMaquina(maquina)}`,
        message:
          `A última verificação de montagens de ${nomeMaquina(maquina)} chegou há ` +
          `${descreverAtraso(minutos)}. O backup pode estar rodando sem a checagem ` +
          "que garante que os pontos estão no ar.",
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: null,
        backupRunId: null,
        relatedJobIds: [],
        context: { minutosSemVerificacao: minutos },
      });
    }
  }

  for (const job of jobs) {
    const maquina = maquinas.find((m) => m.id === job.machineId);
    if (!maquina) continue;
    if (emManutencao(maquina, now)) continue;
    if (maquina.suporte) continue;

    const nome = `${job.name} · ${nomeMaquina(maquina)}`;

    if (job.status === "LATE") {
      // Correlação: a máquina offline já explica o atraso.
      if (maquinasAbsorvendo.has(job.machineId)) continue;

      condicoes.push({
        dedupeKey: chaveJobAtrasado(job.id),
        type: "BACKUP_LATE",
        severity: "CRITICAL",
        title: `Backup atrasado: ${nome}`,
        message:
          job.lastRunAt === null
            ? `O job ${nome} nunca reportou uma execução e já passou da janela esperada.`
            : `O job ${nome} deveria ter rodado e não rodou. ` +
              `Atraso de ${descreverAtraso(job.lateByMinutes)} além da tolerância.`,
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: job.id,
        backupRunId: null,
        relatedJobIds: [],
        context: { lateByMinutes: job.lateByMinutes, lastRunAt: job.lastRunAt?.toISOString() ?? null },
      });
      continue;
    }

    if (job.status === "ERROR") {
      condicoes.push({
        dedupeKey: chaveJobFalhou(job.id),
        type: "BACKUP_FAILED",
        severity: "CRITICAL",
        title: `Backup com erro: ${nome}`,
        message:
          `A última execução do job ${nome} terminou com erro` +
          (job.errorsCount > 0 ? ` (${job.errorsCount} erro(s) reportado(s))` : "") +
          ".",
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: job.id,
        backupRunId: job.lastRunId,
        relatedJobIds: [],
        context: { errorsCount: job.errorsCount },
      });
      continue;
    }

    if (job.status === "WARNING" && alertOnWarning) {
      condicoes.push({
        dedupeKey: chaveJobWarning(job.id),
        type: "BACKUP_WARNING",
        severity: "WARNING",
        title: `Backup com warning: ${nome}`,
        message: `A última execução do job ${nome} terminou com warning.`,
        clientId: maquina.clientId,
        machineId: maquina.id,
        backupJobId: job.id,
        backupRunId: job.lastRunId,
        relatedJobIds: [],
        context: {},
      });
    }
  }

  return condicoes;
}

// ─── Plano: abrir, manter, fechar ────────────────────────────────────────────

/**
 * Compara as condições de agora com os alertas abertos e decide o que fazer.
 * Chamar isto dez vezes seguidas com o mesmo estado produz o mesmo plano:
 * `abrir` só contém o que ainda não tem alerta aberto.
 */
export function planejarAlertas(
  condicoes: Condicao[],
  abertos: AlertaAberto[],
): PlanoDeAlertas {
  const porChave = new Map<string, Condicao>();
  for (const c of condicoes) porChave.set(c.dedupeKey, c);

  const abertosPorChave = new Map<string, AlertaAberto>();
  for (const a of abertos) abertosPorChave.set(a.dedupeKey, a);

  const abrir: Condicao[] = [];
  const manter: { alerta: AlertaAberto; condicao: Condicao }[] = [];
  const fechar: AlertaAberto[] = [];

  for (const [chave, condicao] of porChave) {
    const aberto = abertosPorChave.get(chave);
    if (aberto) manter.push({ alerta: aberto, condicao });
    else abrir.push(condicao);
  }

  for (const aberto of abertos) {
    if (!porChave.has(aberto.dedupeKey)) fechar.push(aberto);
  }

  return { abrir, manter, fechar };
}

/**
 * Explicação do que se resolveu, para o corpo da mensagem de recuperação.
 *
 * Só a frase: o título e a identificação do incidente vêm do formatador, que
 * os monta na mesma régua do alerta que abriu.
 */
export function explicacaoDeRecuperacao(type: AlertaAberto["type"]): string {
  switch (type) {
    case "MACHINE_OFFLINE":
      return "A máquina voltou a se comunicar.";
    case "BACKUP_LATE":
      return "O job voltou a reportar execução.";
    case "BACKUP_FAILED":
      return "A última execução terminou sem erro.";
    case "BACKUP_WARNING":
      return "A última execução terminou limpa.";
    case "MOUNT_FAILED":
      return "Os pontos de montagem voltaram a responder.";
    case "MOUNT_REMOUNTED":
      return "A verificação seguinte encontrou tudo montado, sem precisar remontar.";
    case "MOUNT_LATE":
      return "A verificação de montagens voltou a chegar.";
    default:
      return "A condição que abriu o incidente deixou de valer.";
  }
}
