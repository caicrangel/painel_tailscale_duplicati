/**
 * Diagnóstico geral do sistema: junta banco, worker e integrações num veredito.
 * Função pura — a página coleta os dados, aqui só se decide.
 */

export type NivelSaude = "ok" | "atencao" | "falha";

export type CicloResumo = {
  kind: string;
  ok: boolean;
  atrasado: boolean;
};

export type EntradaSaude = {
  banco: { ok: boolean; latenciaMs: number | null; usoConexoes: number | null };
  ciclos: CicloResumo[];
  tailscaleConfigurado: boolean;
  notificacoesFalhas: number;
};

export type Problema = { nivel: Exclude<NivelSaude, "ok">; texto: string };

export type DiagnosticoSaude = { nivel: NivelSaude; problemas: Problema[] };

/** Ciclos que o worker sempre agenda; TAILSCALE só quando há credencial. */
const CICLOS_ESSENCIAIS = ["LATE_CHECK", "ALERTS", "NOTIFY", "MAINTENANCE"] as const;

export const LATENCIA_LENTA_MS = 500;
export const USO_CONEXOES_ALTO = 0.8;

export function diagnosticarSaude(e: EntradaSaude): DiagnosticoSaude {
  const problemas: Problema[] = [];

  if (!e.banco.ok) {
    problemas.push({ nivel: "falha", texto: "O banco de dados não respondeu." });
  } else {
    if (e.banco.latenciaMs !== null && e.banco.latenciaMs > LATENCIA_LENTA_MS) {
      problemas.push({
        nivel: "atencao",
        texto: `O banco levou ${e.banco.latenciaMs} ms para responder.`,
      });
    }
    if (e.banco.usoConexoes !== null && e.banco.usoConexoes >= USO_CONEXOES_ALTO) {
      problemas.push({
        nivel: "atencao",
        texto: `O banco está com ${Math.round(e.banco.usoConexoes * 100)}% das conexões em uso.`,
      });
    }
  }

  const esperados: string[] = [...CICLOS_ESSENCIAIS];
  if (e.tailscaleConfigurado) esperados.push("TAILSCALE");

  const porKind = new Map(e.ciclos.map((c) => [c.kind, c]));

  if (e.ciclos.length === 0) {
    problemas.push({
      nivel: "falha",
      texto: "O worker nunca registrou um ciclo — o monitoramento não está rodando.",
    });
  } else {
    const parados = e.ciclos.filter((c) => c.atrasado);
    if (parados.length > 0 && parados.length === e.ciclos.length) {
      problemas.push({
        nivel: "falha",
        texto: "Nenhum ciclo do worker rodou recentemente — o container do worker parece parado.",
      });
    } else {
      for (const c of parados) {
        problemas.push({ nivel: "atencao", texto: `O ciclo ${c.kind} parou de rodar.` });
      }
    }
    for (const c of e.ciclos) {
      if (!c.ok) problemas.push({ nivel: "falha", texto: `O último ciclo ${c.kind} falhou.` });
    }
    for (const kind of esperados) {
      if (!porKind.has(kind)) {
        problemas.push({ nivel: "atencao", texto: `O ciclo ${kind} ainda não rodou nenhuma vez.` });
      }
    }
  }

  if (!e.tailscaleConfigurado) {
    problemas.push({
      nivel: "atencao",
      texto: "Tailscale sem credencial: o status das máquinas não é atualizado.",
    });
  }

  if (e.notificacoesFalhas > 0) {
    problemas.push({
      nivel: "atencao",
      texto: `${e.notificacoesFalhas} notificação(ões) não foram entregues.`,
    });
  }

  const nivel: NivelSaude = problemas.some((p) => p.nivel === "falha")
    ? "falha"
    : problemas.length > 0
      ? "atencao"
      : "ok";

  return { nivel, problemas };
}
