"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os dados da tela de tempos em tempos.
 *
 * O painel fica aberto numa aba o dia inteiro, e o worker atualiza o banco a
 * cada minuto. Sem isto, a tela mostra o retrato do momento em que foi
 * carregada — um painel de monitoramento parado é pior que nenhum, porque
 * parece atual.
 *
 * `router.refresh()` revalida só os Server Components: o HTML é trocado sem
 * recarregar a página, então filtro, rolagem e foco continuam onde estavam.
 *
 * Só nas telas de listagem. Em tela com formulário aberto, um refresh no meio
 * da digitação é hostil.
 */
export function AutoRefresh({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  const emAndamento = useRef(false);

  useEffect(() => {
    // Aba em segundo plano não precisa de dado fresco: adia até voltar, para
    // não manter consulta ao banco por tela que ninguém está olhando.
    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      if (emAndamento.current) return;

      emAndamento.current = true;
      router.refresh();
      // O refresh não avisa quando termina; esta janela evita empilhar
      // chamadas se o servidor estiver lento.
      setTimeout(() => {
        emAndamento.current = false;
      }, 2_000);
    };

    const timer = setInterval(atualizar, Math.max(10, segundos) * 1_000);

    // Voltou para a aba: mostra o estado de agora, não o de quando saiu.
    document.addEventListener("visibilitychange", atualizar);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router, segundos]);

  return null;
}
