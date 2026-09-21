import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { getResumoConfig } from "@/lib/config/integracoes";
import { agoraNoFuso, montarResumo, type DadosResumo } from "@/lib/alerts/resumo";
import { enviarTelegram } from "@/lib/alerts/telegram";
import { enviarEmail, escaparHtmlEmail, montarHtml } from "@/lib/alerts/email";

/**
 * Coleta e envio do resumo periódico.
 *
 * Fica em src/lib (e não no worker) porque a interface também precisa disto:
 * o botão "enviar agora" das configurações usa exatamente o mesmo caminho que
 * o envio automático — se divergissem, testar pela tela não provaria nada.
 */

/** Janela que o resumo cobre. */
export const PERIODO_HORAS = 24;

const CHAVE_ULTIMO_ENVIO = "integracao.resumo.ultimoEnvio";


export async function lerUltimoEnvio(): Promise<string | null> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_ULTIMO_ENVIO } });
  return typeof linha?.value === "string" ? linha.value : null;
}

export async function gravarUltimoEnvio(dia: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: CHAVE_ULTIMO_ENVIO },
    create: { key: CHAVE_ULTIMO_ENVIO, value: dia },
    update: { value: dia },
  });
}

/** Retrato do parque para o resumo. */
export async function coletarDadosResumo(incluirSucessos: boolean, desde: Date): Promise<DadosResumo> {
  const [clientes, maquinas, jobs, execucoes, problemas, somaBytes] = await Promise.all([
    prisma.client.count({ where: { active: true } }),
    prisma.machine.groupBy({ by: ["status"], _count: true }),
    prisma.backupJob.groupBy({ by: ["status"], _count: true, where: { active: true } }),
    prisma.backupRun.groupBy({
      by: ["parsedResult"],
      _count: true,
      where: { receivedAt: { gte: desde } },
    }),
    prisma.alert.findMany({
      where: { closedAt: null },
      orderBy: [{ severity: "asc" }, { openedAt: "asc" }],
      take: 15,
      include: { client: { select: { name: true } } },
    }),
    prisma.backupRun.aggregate({
      _sum: { bytesUploaded: true },
      where: { receivedAt: { gte: desde } },
    }),
  ]);

  const m = (s: string) => maquinas.find((x) => x.status === s)?._count ?? 0;
  const j = (s: string) => jobs.find((x) => x.status === s)?._count ?? 0;
  const e = (s: string) => execucoes.find((x) => x.parsedResult === s)?._count ?? 0;

  const sucessos = incluirSucessos
    ? await prisma.backupJob.findMany({
        where: { active: true, status: "OK", lastRunAt: { gte: desde } },
        orderBy: { name: "asc" },
        take: 40,
        include: {
          machine: {
            select: { hostname: true, displayName: true, client: { select: { name: true } } },
          },
        },
      })
    : [];

  const agora = Date.now();
  const desdeTexto = (d: Date) => {
    const horas = Math.floor((agora - d.getTime()) / 3_600_000);
    if (horas < 1) return "menos de 1h";
    if (horas < 48) return `${horas}h`;
    return `${Math.floor(horas / 24)} dias`;
  };

  return {
    periodoHoras: PERIODO_HORAS,
    clientes,
    maquinas: {
      online: m("ONLINE"),
      idle: m("IDLE"),
      offline: m("OFFLINE"),
      desconhecidas: m("UNKNOWN"),
    },
    jobs: {
      ok: j("OK"),
      warning: j("WARNING"),
      erro: j("ERROR"),
      atrasados: j("LATE"),
      pausados: j("PAUSED"),
    },
    execucoes: {
      sucesso: e("SUCCESS"),
      warning: e("WARNING"),
      erro: e("ERROR") + e("FATAL"),
    },
    problemas: problemas.map((p) => ({
      titulo: p.title,
      cliente: p.client?.name ?? null,
      desde: desdeTexto(p.openedAt),
    })),
    sucessos: sucessos.map((s) => ({
      job: s.name,
      maquina: s.machine.displayName ?? s.machine.hostname,
      cliente: s.machine.client?.name ?? null,
    })),
    bytesEnviados: somaBytes._sum.bytesUploaded === null ? null : Number(somaBytes._sum.bytesUploaded),
    incluirSucessos,
  };
}

/** Envio manual, pelo botão "enviar agora" nas configurações. */
export async function enviarResumoAgora(agora: Date = new Date()): Promise<{ ok: boolean; erro?: string }> {
  const config = await getResumoConfig();
  const desde = new Date(agora.getTime() - PERIODO_HORAS * 3_600_000);
  const dados = await coletarDadosResumo(config.incluirSucessos, desde);
  const local = agoraNoFuso(agora, env().TZ);
  const resumo = montarResumo(dados, local.dia.split("-").reverse().join("/"));

  const erros: string[] = [];
  if (config.porTelegram) {
    const r = await enviarTelegram({ texto: resumo.html, forcar: true });
    if (!r.ok) erros.push(`Telegram: ${r.erro}`);
  }
  if (config.porEmail) {
    const r = await enviarEmail({
      assunto: resumo.titulo,
      texto: resumo.texto,
      html: montarHtml(resumo.titulo, escaparHtmlEmail(resumo.texto)),
      forcar: true,
    });
    if (!r.ok) erros.push(`E-mail: ${r.erro}`);
  }

  if (!config.porTelegram && !config.porEmail) {
    return { ok: false, erro: "Nenhum canal selecionado para o resumo." };
  }

  return erros.length > 0 ? { ok: false, erro: erros.join(" | ") } : { ok: true };
}
