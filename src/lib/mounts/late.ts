/**
 * Atraso da verificação de montagens.
 *
 * Mesma regra do backup atrasado, um nível acima: o silêncio é o sintoma. Se a
 * verificação parou de chegar, o backup pode estar rodando sem a checagem que
 * garante que os shares estão no ar — e ninguém percebe.
 *
 * Função pura: o engine de alertas e o dashboard precisam do mesmo veredito, e
 * duas cópias da regra divergem com o tempo.
 */
export type EntradaAtrasoMontagem = {
  ultimaEm: Date | null;
  /** Nulo = esta máquina não é vigiada por atraso. */
  intervaloMinutos: number | null;
  toleranciaMinutos: number;
  now: Date;
};

export type AtrasoMontagem = {
  atrasada: boolean;
  /** Minutos desde a última verificação; null quando nunca houve uma. */
  minutosSemVerificacao: number | null;
};

export function avaliarAtrasoMontagem({
  ultimaEm,
  intervaloMinutos,
  toleranciaMinutos,
  now,
}: EntradaAtrasoMontagem): AtrasoMontagem {
  if (ultimaEm === null) {
    return { atrasada: false, minutosSemVerificacao: null };
  }

  const decorrido = now.getTime() - ultimaEm.getTime();
  const minutos = Math.floor(decorrido / 60_000);

  if (intervaloMinutos === null) {
    return { atrasada: false, minutosSemVerificacao: minutos };
  }

  const limite = (intervaloMinutos + toleranciaMinutos) * 60_000;
  return { atrasada: decorrido > limite, minutosSemVerificacao: minutos };
}
