/**
 * Resumo periódico do parque: a mensagem que chega no Telegram (ou por e-mail)
 * dizendo como as últimas 24 horas se comportaram.
 *
 * Função pura: recebe o retrato já coletado e devolve o texto. Sem Prisma,
 * sem rede, sem Date.now() implícito (regra 5 do CLAUDE.md).
 */

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

export type ResumoFormatado = { titulo: string; texto: string; html: string };

function bytesLegiveis(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const unidades = ["B", "KB", "MB", "GB", "TB", "PB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < unidades.length - 1) {
    n /= 1024;
    i += 1;
  }
  const casas = i === 0 ? 0 : n < 10 ? 2 : 1;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[i]}`;
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Emoji de cabeçalho conforme a gravidade do que está aberto. */
function sinal(dados: DadosResumo): string {
  if (dados.jobs.erro > 0 || dados.jobs.atrasados > 0) return "🔴";
  if (dados.jobs.warning > 0 || dados.maquinas.offline > 0) return "🟡";
  return "🟢";
}

export function montarResumo(dados: DadosResumo, dataReferencia: string): ResumoFormatado {
  const titulo = `Resumo de backups — ${dataReferencia}`;

  const linhas: string[] = [];
  linhas.push(`${sinal(dados)} ${titulo}`);
  linhas.push("");
  linhas.push(`Últimas ${dados.periodoHoras}h · ${dados.clientes} cliente(s)`);
  linhas.push("");

  linhas.push("MÁQUINAS");
  linhas.push(
    `  online ${dados.maquinas.online} · ociosas ${dados.maquinas.idle} · offline ${dados.maquinas.offline}`,
  );
  linhas.push("");

  linhas.push("JOBS");
  linhas.push(
    `  OK ${dados.jobs.ok} · warning ${dados.jobs.warning} · erro ${dados.jobs.erro} · atrasados ${dados.jobs.atrasados}`,
  );
  if (dados.jobs.pausados > 0) linhas.push(`  (${dados.jobs.pausados} pausado(s), fora do monitoramento)`);
  linhas.push("");

  linhas.push(`EXECUÇÕES NAS ÚLTIMAS ${dados.periodoHoras}H`);
  linhas.push(
    `  sucesso ${dados.execucoes.sucesso} · warning ${dados.execucoes.warning} · erro ${dados.execucoes.erro}`,
  );
  if (dados.bytesEnviados !== null) {
    linhas.push(`  enviado ao destino: ${bytesLegiveis(dados.bytesEnviados)}`);
  }

  if (dados.problemas.length > 0) {
    linhas.push("");
    linhas.push(`PRECISAM DE ATENÇÃO (${dados.problemas.length})`);
    for (const p of dados.problemas) {
      linhas.push(`  • ${p.titulo}${p.cliente ? ` — ${p.cliente}` : ""} (desde ${p.desde})`);
    }
  } else {
    linhas.push("");
    linhas.push("✅ Nenhum problema aberto.");
  }

  if (dados.incluirSucessos && dados.sucessos.length > 0) {
    linhas.push("");
    linhas.push(`RODARAM SEM PROBLEMA (${dados.sucessos.length})`);
    for (const s of dados.sucessos) {
      linhas.push(`  • ${s.job} — ${s.maquina}${s.cliente ? ` · ${s.cliente}` : ""}`);
    }
  }

  const texto = linhas.join("\n");

  // Versão HTML para o Telegram: negrito nos cabeçalhos, resto escapado.
  const html = linhas
    .map((linha) => {
      const cabecalho = /^[A-ZÇÃÕÉÚ][A-ZÇÃÕÉÚ0-9 ()À-Ú]+$/.test(linha.trim()) && !linha.startsWith("  ");
      return cabecalho ? `<b>${escapar(linha)}</b>` : escapar(linha);
    })
    .join("\n");

  return { titulo, texto, html };
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
