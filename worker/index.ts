import cron from "node-cron";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { comTravaLocal } from "./lib/sync-log";
import { sincronizarTailscale } from "./tasks/tailscale-sync";
import { verificarAtrasos } from "./tasks/late-check";
import { avaliarAlertas } from "./tasks/alerts";
import { despacharNotificacoes } from "./tasks/notify";
import { manutencao } from "./tasks/maintenance";

/**
 * Worker do painel. Processo separado do Next, mesmo repositório e mesmo
 * Prisma Client. Sem servidor HTTP e sem fila externa — só cron + Postgres.
 */

const e = env();

const TAREFAS = [
  {
    nome: "tailscale-sync",
    cron: e.CRON_TAILSCALE_SYNC,
    executar: () => sincronizarTailscale(),
    exigeTailscale: true,
  },
  { nome: "late-check", cron: e.CRON_LATE_CHECK, executar: () => verificarAtrasos() },
  { nome: "alerts", cron: e.CRON_ALERTS, executar: () => avaliarAlertas() },
  { nome: "notify", cron: e.CRON_NOTIFY, executar: () => despacharNotificacoes() },
  { nome: "maintenance", cron: "17 * * * *", executar: () => manutencao() },
] as const;

const tailscaleConfigurado = Boolean(
  e.TAILSCALE_OAUTH_CLIENT_ID && e.TAILSCALE_OAUTH_CLIENT_SECRET,
);

function agendar() {
  for (const tarefa of TAREFAS) {
    if ("exigeTailscale" in tarefa && tarefa.exigeTailscale && !tailscaleConfigurado) {
      console.warn(
        `[worker] ${tarefa.nome} desativada: defina TAILSCALE_OAUTH_CLIENT_ID e ` +
          "TAILSCALE_OAUTH_CLIENT_SECRET para ativar a coleta de status das máquinas.",
      );
      continue;
    }

    if (!cron.validate(tarefa.cron)) {
      console.error(`[worker] cron inválido para ${tarefa.nome}: "${tarefa.cron}" — tarefa ignorada`);
      continue;
    }

    cron.schedule(
      tarefa.cron,
      () => {
        void comTravaLocal(tarefa.nome, async () => {
          const inicio = Date.now();
          const itens = await tarefa.executar();
          const ms = Date.now() - inicio;
          if (itens > 0) console.log(`[worker] ${tarefa.nome}: ${itens} item(ns) em ${ms}ms`);
        });
      },
      { timezone: e.TZ },
    );

    console.log(`[worker] ${tarefa.nome} agendada: ${tarefa.cron} (${e.TZ})`);
  }
}

async function main() {
  console.log("[worker] iniciando…");
  await prisma.$queryRaw`SELECT 1`;
  console.log("[worker] banco acessível");

  agendar();

  // Primeira passada imediata: não faz sentido esperar 5 minutos para saber
  // que um job está atrasado há 5 dias.
  void comTravaLocal("bootstrap", async () => {
    if (tailscaleConfigurado) await sincronizarTailscale();
    await verificarAtrasos();
    await avaliarAlertas();
    await despacharNotificacoes();
    console.log("[worker] passada inicial concluída");
  });
}

async function encerrar(sinal: string) {
  console.log(`[worker] recebido ${sinal}, encerrando…`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void encerrar("SIGTERM"));
process.on("SIGINT", () => void encerrar("SIGINT"));

main().catch((erro) => {
  console.error("[worker] falha fatal ao iniciar:", erro);
  process.exit(1);
});
