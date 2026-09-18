import type { SyncKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Quem vigia o vigia: todo ciclo do worker vira uma linha em sync_logs.
 * Sem isso, um worker que morre em silêncio faz o painel mostrar "tudo verde"
 * enquanto ninguém está olhando — exatamente o problema que este sistema existe
 * para resolver, um nível acima.
 */
export async function registrarCiclo(
  kind: SyncKind,
  tarefa: () => Promise<number>,
): Promise<number> {
  const log = await prisma.syncLog.create({ data: { kind }, select: { id: true } });

  try {
    const itens = await tarefa();
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), ok: true, itemsProcessed: itens },
    });
    return itens;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), ok: false, error: mensagem.slice(0, 1000) },
    });
    console.error(`[worker:${kind}] falhou:`, mensagem);
    return 0;
  }
}

/** Impede que dois ciclos da mesma tarefa rodem sobrepostos. */
const emExecucao = new Set<string>();

export async function comTravaLocal(nome: string, tarefa: () => Promise<void>): Promise<void> {
  if (emExecucao.has(nome)) {
    console.warn(`[worker] ciclo de ${nome} ainda em execução; pulando esta rodada`);
    return;
  }
  emExecucao.add(nome);
  try {
    await tarefa();
  } finally {
    emExecucao.delete(nome);
  }
}
