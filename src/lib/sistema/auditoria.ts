import { z } from "zod";

/** Leitura humana do log de auditoria. Função pura: o banco guarda só o código. */

export const CATEGORIAS_AUDITORIA = {
  auth: "Acesso",
  cliente: "Clientes",
  maquina: "Máquinas",
  job: "Jobs",
  alerta: "Alertas",
  usuario: "Usuários",
  configuracao: "Configurações",
  notificacao: "Notificações",
} as const;

export type CategoriaAuditoria = keyof typeof CATEGORIAS_AUDITORIA;

const ROTULOS: Record<string, string> = {
  "auth.login": "Entrou no painel",
  "auth.logout": "Saiu do painel",
  "auth.login_falhou": "Tentativa de login falhou",
  "auth.login_bloqueado_rate_limit":
    "Login bloqueado por excesso de tentativas",
  "cliente.criado": "Cliente criado",
  "cliente.atualizado": "Cliente alterado",
  "cliente.removido": "Cliente removido",
  "cliente.token_rotacionado": "Token de ingestão gerado",
  "cliente.token_revogado": "Token de ingestão revogado",
  "maquina.atualizada": "Máquina alterada",
  "maquina.mesclada": "Máquinas mescladas",
  "maquina.removida": "Máquina removida",
  "job.atualizado": "Job alterado",
  "job.removido": "Job removido",
  "alerta.reconhecido": "Alerta reconhecido",
  "usuario.criado": "Usuário criado",
  "usuario.atualizado": "Usuário alterado",
  "usuario.removido": "Usuário removido",
  "usuario.senha_redefinida": "Senha redefinida",
  "configuracao.aparencia_salva": "Aparência alterada",
  "configuracao.execucao_salva": "Parâmetros de execução alterados",
  "configuracao.limiares_salvos": "Limiares de monitoramento alterados",
  "configuracao.resumo_salvo": "Resumo periódico configurado",
  "configuracao.resumo_enviado_manual": "Resumo enviado manualmente",
  "configuracao.smtp_salva": "E-mail (SMTP) configurado",
  "configuracao.smtp_teste": "Teste de e-mail enviado",
  "configuracao.telegram_salva": "Telegram configurado",
  "configuracao.telegram_teste": "Teste de Telegram enviado",
  "notificacao.reenvio": "Notificações recolocadas na fila",
};

export type TomAuditoria = "danger" | "warn" | "neutral";

export function descreverAcao(action: string): {
  rotulo: string;
  categoria: string;
  tom: TomAuditoria;
} {
  const prefixo = action.split(".")[0] ?? "";
  const categoria =
    prefixo in CATEGORIAS_AUDITORIA
      ? CATEGORIAS_AUDITORIA[prefixo as CategoriaAuditoria]
      : "Outros";
  // Ação nova sem rótulo ainda aparece, com o código cru — nunca some do log.
  const rotulo = ROTULOS[action] ?? action;
  const tom: TomAuditoria =
    action.includes("falhou") || action.includes("bloqueado")
      ? "danger"
      : action.endsWith("removido") ||
          action.endsWith("removida") ||
          action.endsWith("revogado")
        ? "warn"
        : "neutral";
  return { rotulo, categoria, tom };
}

export const POR_PAGINA_AUDITORIA = 30;

export const filtroAuditoriaSchema = z.object({
  categoria: z
    .enum(
      Object.keys(CATEGORIAS_AUDITORIA) as [
        CategoriaAuditoria,
        ...CategoriaAuditoria[],
      ],
    )
    .optional()
    .catch(undefined),
  pagina: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export type FiltroAuditoria = z.infer<typeof filtroAuditoriaSchema>;

/** Janela em que uma notificação não entregue ainda conta como problema atual. */
export const JANELA_FALHAS_NOTIFICACAO_DIAS = 7;
