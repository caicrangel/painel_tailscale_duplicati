import { env } from "@/lib/config/env";
import { getResumoConfig } from "@/lib/config/integracoes";
import { agoraNoFuso, deveEnviarResumo, montarResumo } from "@/lib/alerts/resumo";
import {
  coletarDadosResumo,
  gravarUltimoEnvio,
  lerUltimoEnvio,
  PERIODO_HORAS,
} from "@/lib/alerts/resumo-envio";
import { enviarTelegram } from "@/lib/alerts/telegram";
import { enviarEmail, escaparHtmlEmail, montarHtml } from "@/lib/alerts/email";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Resumo periódico (avaliado a cada minuto; envia uma vez por dia no horário
 * configurado). Se o worker estiver fora no minuto exato, o resumo sai no
 * próximo ciclo — atrasado é melhor que nenhum.
 */
export async function enviarResumoPeriodico(agora: Date = new Date()): Promise<number> {
  return registrarCiclo("RESUMO", async () => {
    const config = await getResumoConfig();
    const local = agoraNoFuso(agora, env().TZ);

    if (!deveEnviarResumo({ ...config, agoraLocal: local, ultimoEnvio: await lerUltimoEnvio() })) {
      return 0;
    }

    const desde = new Date(agora.getTime() - PERIODO_HORAS * 3_600_000);
    const dados = await coletarDadosResumo(config.incluirSucessos, desde);
    const resumo = montarResumo(dados, local.dia.split("-").reverse().join("/"));

    let enviados = 0;

    if (config.porTelegram) {
      const r = await enviarTelegram({ texto: resumo.html });
      if (r.ok) enviados += 1;
      else console.error("[resumo] falha no Telegram:", r.erro);
    }

    if (config.porEmail) {
      const r = await enviarEmail({
        assunto: resumo.titulo,
        texto: resumo.texto,
        html: montarHtml(resumo.titulo, escaparHtmlEmail(resumo.texto)),
      });
      if (r.ok) enviados += 1;
      else console.error("[resumo] falha no e-mail:", r.erro);
    }

    // Marca o dia mesmo se os envios falharam: o certo é não martelar o canal
    // a cada minuto até meia-noite. O erro fica no log e no SyncLog.
    await gravarUltimoEnvio(local.dia);

    return enviados;
  });
}
