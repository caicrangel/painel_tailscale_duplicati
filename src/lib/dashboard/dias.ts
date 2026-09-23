/**
 * Eixo de dias da faixa de execuções — função pura (regra 5 do CLAUDE.md).
 *
 * Existe separado porque o eixo estava sendo montado com `toISOString()`, que
 * é UTC. O servidor roda em UTC, então entre 21h e meia-noite de Brasília a
 * faixa exibia o dia SEGUINTE como última célula: uma casa vazia que parecia
 * "backup não rodou hoje" quando o dia local nem tinha acabado.
 *
 * Todo dia aqui é o dia do calendário na timezone da operação, escrito como
 * `YYYY-MM-DD` — a mesma chave que a consulta devolve.
 */

/** Dia do calendário em que este instante cai, na timezone dada. */
export function diaLocal(instante: Date, timeZone: string): string {
  // en-CA formata como YYYY-MM-DD, que é o que queremos como chave.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Os últimos N dias do calendário local, do mais antigo para o mais recente,
 * terminando no dia de hoje.
 *
 * A aritmética anda de 24h a partir do MEIO-DIA do dia local, não da
 * meia-noite: numa virada de horário de verão o dia tem 23 ou 25 horas, e
 * partir da meia-noite faria um dia ser pulado ou repetido. O Brasil não usa
 * mais horário de verão, mas a timezone é configurável e o custo disto é zero.
 */
export function eixoDeDias(dias: number, agora: Date, timeZone: string): string[] {
  const [ano, mes, dia] = diaLocal(agora, timeZone).split("-").map(Number);
  const meioDiaDeHoje = Date.UTC(ano!, mes! - 1, dia!, 12);

  const eixo: string[] = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    eixo.push(new Date(meioDiaDeHoje - i * 86_400_000).toISOString().slice(0, 10));
  }
  return eixo;
}

/** Instante a partir do qual buscar execuções para cobrir o eixo inteiro. */
export function inicioDaJanela(eixo: string[]): Date {
  const [ano, mes, dia] = eixo[0]!.split("-").map(Number);
  // Um dia de folga cobre qualquer offset entre UTC e a timezone local sem
  // precisar converter meia-noite local para UTC; o que sobra é descartado
  // na hora de casar com o eixo.
  return new Date(Date.UTC(ano!, mes! - 1, dia!, 0, 0, 0) - 86_400_000);
}
