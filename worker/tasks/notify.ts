import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import {
  enviarTelegram,
  formatarMensagemAlerta,
  formatarRecuperacao,
} from "@/lib/alerts/telegram";
import { enviarEmail, escaparHtmlEmail, montarHtml } from "@/lib/alerts/email";
import { explicacaoDeRecuperacao } from "@/lib/alerts/engine";
import { formatarRecibo } from "@/lib/alerts/execucao";
import { registrarCiclo } from "../lib/sync-log";

/** Depois de 5 tentativas o envio para de ser retentado; o alerta continua na UI. */
const MAX_TENTATIVAS = 5;

/**
 * Fila de notificação (a cada 1 min).
 *
 * Separada do avaliador de propósito: se o Telegram estiver fora, o incidente
 * já está registrado e visível na UI — a mensagem é reenviada depois.
 */
export async function despacharNotificacoes(now: Date = new Date()): Promise<number> {
  return registrarCiclo("NOTIFY", async () => {
    // Recibos primeiro: são a confirmação de que o backup rodou, e chegar
    // rápido é o ponto deles.
    const recibos = await despacharRecibos(now);

    const pendentes = await prisma.alertNotification.findMany({
      where: { status: "PENDING", attempts: { lt: MAX_TENTATIVAS } },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        alert: {
          include: {
            client: { select: { name: true, telegramChatId: true } },
            machine: { select: { hostname: true, displayName: true } },
            backupJob: { select: { name: true } },
          },
        },
      },
    });

    const baseUrl = env().APP_BASE_URL.replace(/\/+$/, "");
    let enviadas = 0;

    for (const notificacao of pendentes) {
      const alerta = notificacao.alert;

      const identificacao = {
        type: alerta.type,
        clientName: alerta.client?.name ?? null,
        machineName: alerta.machine
          ? (alerta.machine.displayName ?? alerta.machine.hostname)
          : null,
        jobName: alerta.backupJob?.name ?? null,
        abertoEm: alerta.openedAt,
      };

      // Um formatador só para os dois canais: o Telegram recebe o HTML, o
      // e-mail recebe o texto e o envelopa no seu próprio HTML monoespaçado.
      // Mandar o markup de um no outro vaza tag na mensagem.
      const mensagem =
        notificacao.kind === "OPEN"
          ? formatarMensagemAlerta(
              {
                ...identificacao,
                severity: alerta.severity,
                title: alerta.title,
                message: alerta.message,
                url: `${baseUrl}/alertas`,
              },
              env().TZ,
            )
          : formatarRecuperacao(
              {
                ...identificacao,
                title: alerta.title,
                explicacao: explicacaoDeRecuperacao(alerta.type),
                fechadoEm: alerta.closedAt ?? now,
              },
              env().TZ,
            );

      const resultado =
        notificacao.channel === "email"
          ? await enviarEmail({
              assunto:
                notificacao.kind === "OPEN"
                  ? `[${alerta.severity}] ${alerta.title}`
                  : `[resolvido] ${alerta.title}`,
              texto: mensagem.texto,
              html: montarHtml(mensagem.titulo, escaparHtmlEmail(mensagem.texto), true),
            })
          : await enviarTelegram({
              texto: mensagem.html,
              // Chat por cliente quando houver; senão cai no chat global.
              chatId: alerta.client?.telegramChatId ?? null,
            });

      if (resultado.ok) {
        await prisma.alertNotification.update({
          where: { id: notificacao.id },
          data: { status: "SENT", sentAt: now, attempts: { increment: 1 }, lastError: null },
        });
        enviadas += 1;
      } else {
        const tentativas = notificacao.attempts + 1;
        await prisma.alertNotification.update({
          where: { id: notificacao.id },
          data: {
            attempts: tentativas,
            lastError: resultado.erro.slice(0, 500),
            status: tentativas >= MAX_TENTATIVAS ? "FAILED" : "PENDING",
          },
        });
      }
    }

    return enviadas + recibos;
  });
}

/**
 * Recibos de execução: "rodou, e deu isto". Fila própria, separada da de
 * incidentes — um recibo não abre nem fecha nada, só precisa sair uma vez.
 */
async function despacharRecibos(agora: Date): Promise<number> {
  const pendentes = await prisma.runNotification.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_TENTATIVAS } },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      backupRun: {
        include: {
          backupJob: {
            include: {
              machine: {
                select: {
                  hostname: true,
                  displayName: true,
                  client: { select: { name: true, telegramChatId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  let enviados = 0;

  for (const pendente of pendentes) {
    const run = pendente.backupRun;
    const job = run.backupJob;
    const maquina = job.machine;

    const recibo = formatarRecibo(
      {
        cliente: maquina.client?.name ?? null,
        maquina: maquina.displayName ?? maquina.hostname,
        job: job.name,
        parsedResult: run.parsedResult,
        rawPayload: run.rawPayload,
        recebidoEm: run.receivedAt,
        durationSeconds: run.durationSeconds,
        bytesUploaded: run.bytesUploaded,
      },
      env().TZ,
    );

    const resultado =
      pendente.channel === "email"
        ? await enviarEmail({
            assunto: recibo.titulo,
            texto: recibo.texto,
            html: montarHtml(recibo.titulo, escaparHtmlEmail(recibo.texto), true),
          })
        : await enviarTelegram({
            texto: recibo.html,
            chatId: maquina.client?.telegramChatId ?? null,
          });

    if (resultado.ok) {
      await prisma.runNotification.update({
        where: { id: pendente.id },
        data: { status: "SENT", sentAt: agora, attempts: { increment: 1 }, lastError: null },
      });
      enviados += 1;
    } else {
      const tentativas = pendente.attempts + 1;
      await prisma.runNotification.update({
        where: { id: pendente.id },
        data: {
          attempts: tentativas,
          lastError: resultado.erro.slice(0, 500),
          status: tentativas >= MAX_TENTATIVAS ? "FAILED" : "PENDING",
        },
      });
    }
  }

  return enviados;
}
