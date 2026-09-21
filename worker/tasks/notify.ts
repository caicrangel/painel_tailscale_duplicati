import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { enviarTelegram, formatarMensagemAlerta } from "@/lib/alerts/telegram";
import { enviarEmail, escaparHtmlEmail, montarHtml } from "@/lib/alerts/email";
import { formatarAlertaSimples, mensagemDeRecuperacao } from "@/lib/alerts/engine";
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
    const pendentes = await prisma.alertNotification.findMany({
      where: { status: "PENDING", attempts: { lt: MAX_TENTATIVAS } },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        alert: {
          include: {
            client: { select: { name: true, telegramChatId: true } },
          },
        },
      },
    });

    const baseUrl = env().APP_BASE_URL.replace(/\/+$/, "");
    let enviadas = 0;

    for (const notificacao of pendentes) {
      const alerta = notificacao.alert;

      const recuperacao = () =>
        mensagemDeRecuperacao(
          {
            id: alerta.id,
            dedupeKey: alerta.dedupeKey,
            type: alerta.type,
            relatedJobIds: alerta.relatedJobIds,
          },
          alerta.title,
        );

      // O Telegram recebe HTML; o e-mail recebe texto puro e é envelopado no
      // seu próprio HTML. Mandar o markup de um no outro vaza tag na mensagem.
      const textoSimples =
        notificacao.kind === "OPEN"
          ? formatarAlertaSimples({
              severity: alerta.severity,
              title: alerta.title,
              message: alerta.message,
              clientName: alerta.client?.name ?? null,
            })
          : recuperacao();

      const texto =
        notificacao.kind === "OPEN"
          ? formatarMensagemAlerta({
              severity: alerta.severity,
              title: alerta.title,
              message: alerta.message,
              clientName: alerta.client?.name ?? null,
              url: `${baseUrl}/alertas`,
            })
          : recuperacao();

      const resultado =
        notificacao.channel === "email"
          ? await enviarEmail({
              assunto:
                notificacao.kind === "OPEN"
                  ? `[${alerta.severity}] ${alerta.title}`
                  : `[resolvido] ${alerta.title}`,
              texto: textoSimples,
              html: montarHtml(alerta.title, escaparHtmlEmail(textoSimples)),
            })
          : await enviarTelegram({
              texto,
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

    return enviadas;
  });
}
