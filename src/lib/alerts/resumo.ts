/**
 * Resumo periódico do parque: a mensagem que chega no Telegram (ou por e-mail)
 * dizendo como as últimas 24 horas se comportaram.
 *
 * Função pura: recebe o retrato já coletado e devolve o texto. Sem Prisma,
 * sem rede, sem Date.now() implícito (regra 5 do CLAUDE.md).
 */

import {
  bytesLegiveis,
  cabecalhoTabela,
  campo,
  item,
  linhaTabela,
  linhaValor,
  montarMensagem,
  numero,
  type MensagemFormatada,
} from "@/lib/alerts/formato";

export type DadosResumo = {
  periodoHoras: number;
  clientes: number;
  maquinas: { online: number; idle: number; offline: number; desconhecidas: number };
  jobs: { ok: number; warning: number; erro: number; atrasados: number; pausados: number };
  execucoes: { sucesso: number; warning: number; erro: number };
  /** Problemas abertos agora, do mais grave para o mais antigo. */
  problemas: { titulo: string; cliente: string | null; desde: string }[];
  /** Jobs que rodaram bem no período — só entram se incluirSucessos. */
  sucessos: { job: string; maquina: string; cliente: string | null }[];
  bytesEnviados: number | null;
  incluirSucessos: boolean;
};

export type ResumoFormatado = MensagemFormatada;

/** Emoji de cabeçalho conforme a gravidade do que está aberto. */
function sinal(dados: DadosResumo): string {
  if (dados.jobs.erro > 0 || dados.jobs.atrasados > 0) return "🔴";
  if (dados.jobs.warning > 0 || dados.maquinas.offline > 0) return "🟡";
  return "🟢";
}

export function montarResumo(dados: DadosResumo, dataReferencia: string): ResumoFormatado {
  const titulo = `${sinal(dados)} Resumo de backups — ${dataReferencia}`;

  const bloco: string[] = [];
  bloco.push(campo("📅 Período", `últimas ${dados.periodoHoras}h`));
  bloco.push(campo("🏢 Clientes", `${dados.clientes}`));

  bloco.push("");
  bloco.push(cabecalhoTabela("🖥️ MÁQUINAS", false));
  bloco.push(linhaTabela("Online", numero(dados.maquinas.online)));
  bloco.push(linhaTabela("Ociosas", numero(dados.maquinas.idle)));
  bloco.push(linhaTabela("Offline", numero(dados.maquinas.offline)));

  bloco.push("");
  bloco.push(cabecalhoTabela("📋 JOBS", false));
  bloco.push(linhaTabela("OK", numero(dados.jobs.ok)));
  bloco.push(linhaTabela("Warning", numero(dados.jobs.warning)));
  bloco.push(linhaTabela("Erro", numero(dados.jobs.erro)));
  bloco.push(linhaTabela("Atrasados", numero(dados.jobs.atrasados)));
  if (dados.jobs.pausados > 0) bloco.push(linhaTabela("Pausados", numero(dados.jobs.pausados)));

  bloco.push("");
  bloco.push(cabecalhoTabela(`▶️ EXECUÇÕES ${dados.periodoHoras}H`, false));
  bloco.push(linhaTabela("Sucesso", numero(dados.execucoes.sucesso)));
  bloco.push(linhaTabela("Warning", numero(dados.execucoes.warning)));
  bloco.push(linhaTabela("Erro", numero(dados.execucoes.erro)));

  const enviado = bytesLegiveis(dados.bytesEnviados);
  if (enviado) {
    bloco.push("");
    bloco.push("☁️ DESTINO");
    bloco.push(linhaValor("Enviado ao destino", enviado));
  }

  // As listas ficam fora do bloco monoespaçado: nome de job e de máquina são
  // longos e dentro do <pre> virariam rolagem horizontal no celular.
  const rodape: string[] = [];

  if (dados.problemas.length > 0) {
    rodape.push("");
    rodape.push(`⚠️ PRECISAM DE ATENÇÃO (${dados.problemas.length})`);
    for (const p of dados.problemas) {
      rodape.push(item(`${p.titulo}${p.cliente ? ` — ${p.cliente}` : ""} (desde ${p.desde})`));
    }
  } else {
    rodape.push("");
    rodape.push("✅ Nenhum problema aberto.");
  }

  if (dados.incluirSucessos && dados.sucessos.length > 0) {
    rodape.push("");
    rodape.push(`✅ RODARAM SEM PROBLEMA (${dados.sucessos.length})`);
    for (const s of dados.sucessos) {
      rodape.push(item(`${s.job} — ${s.maquina}${s.cliente ? ` · ${s.cliente}` : ""}`));
    }
  }

  return montarMensagem({ titulo, bloco, rodape });
}

/**
 * Decide se está na hora de enviar o resumo.
 *
 * Regra: o horário configurado já passou hoje e ainda não houve envio hoje.
 * Se o worker ficar fora do ar no minuto exato, o resumo sai no próximo ciclo
 * em vez de ser pulado — um resumo atrasado vale mais que resumo nenhum.
 */
export function deveEnviarResumo(params: {
  enabled: boolean;
  horario: string;
  /** Data/hora atual já convertida para o fuso da operação. */
  agoraLocal: { hora: number; minuto: number; dia: string };
  /** "YYYY-MM-DD" do último envio, ou null. */
  ultimoEnvio: string | null;
}): boolean {
  if (!params.enabled) return false;
  if (params.ultimoEnvio === params.agoraLocal.dia) return false;

  const [h, m] = params.horario.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return false;

  const minutosAgora = params.agoraLocal.hora * 60 + params.agoraLocal.minuto;
  return minutosAgora >= h * 60 + m;
}

/** Quebra "agora" nas partes que interessam, no fuso da operação. */
export function agoraNoFuso(agora: Date, timeZone: string): { hora: number; minuto: number; dia: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(fmt.formatToParts(agora).map((p) => [p.type, p.value]));
  return {
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    dia: `${partes.year}-${partes.month}-${partes.day}`,
  };
}
