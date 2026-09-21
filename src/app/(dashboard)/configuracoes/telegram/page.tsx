import { getResumoConfig, getTelegramConfig } from "@/lib/config/integracoes";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResumoForm, TelegramForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function TelegramPage() {
  await requireRole("ADMIN");
  const [telegram, resumo] = await Promise.all([getTelegramConfig(), getResumoConfig()]);

  const prontoParaUso = telegram.botToken !== null && telegram.chatId !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Conexão</CardTitle>
          <Badge tone={telegram.enabled && prontoParaUso ? "ok" : prontoParaUso ? "neutral" : "warn"} dot>
            {telegram.enabled && prontoParaUso
              ? "ativo"
              : prontoParaUso
                ? "configurado, desligado"
                : "incompleto"}
          </Badge>
        </CardHeader>
        <CardBody>
          <TelegramForm
            enabled={telegram.enabled}
            chatId={telegram.chatId}
            origemToken={telegram.origemToken}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo periódico</CardTitle>
        </CardHeader>
        <CardBody>
          <ResumoForm
            enabled={resumo.enabled}
            horario={resumo.horario}
            porTelegram={resumo.porTelegram}
            porEmail={resumo.porEmail}
            incluirSucessos={resumo.incluirSucessos}
          />
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Quando o painel manda mensagem</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>
              <strong className="text-[var(--color-fg)]">Backup com erro</strong> — assim que um
              relatório chega com resultado Error ou Fatal.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Backup atrasado</strong> — quando passa da
              frequência esperada mais a tolerância do job.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Máquina offline</strong> — sem contato além
              do limite. Os jobs atrasados dela entram nessa mesma mensagem, em vez de virarem uma
              mensagem cada.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Recuperação</strong> — uma mensagem quando
              cada um desses problemas se resolve.
            </li>
          </ul>
          <p className="mt-4 text-xs text-[var(--color-faint)]">
            Um incidente gera uma mensagem, não uma por ciclo do worker. Alertas de warning são
            opcionais e ficam na aba Monitoramento.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
