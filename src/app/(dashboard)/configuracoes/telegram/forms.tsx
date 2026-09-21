"use client";

import { ActionButton, ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  enviarResumoTeste,
  salvarExecucao,
  salvarResumo,
  salvarTelegram,
  testarTelegram,
} from "@/server/settings-actions";

export function TelegramForm({
  enabled,
  chatId,
  origemToken,
}: {
  enabled: boolean;
  chatId: string | null;
  origemToken: "banco" | "env" | "nenhum";
}) {
  return (
    <ActionForm
      action={salvarTelegram}
      submitLabel="Salvar"
      successMessage="Configuração do Telegram salva."
      extraActions={
        <ActionButton
          action={testarTelegram}
          label="Enviar teste"
          pendingLabel="Enviando…"
          variant="secondary"
        />
      }
    >
      <div className="space-y-5">
        <SwitchField
          name="enabled"
          label="Enviar alertas pelo Telegram"
          hint="Desligado, os incidentes continuam aparecendo no painel — só não chegam no celular."
          defaultChecked={enabled}
        />

        <Field
          label="Token do bot"
          hint={
            origemToken === "banco"
              ? "Um token já está salvo. Deixe em branco para mantê-lo."
              : origemToken === "env"
                ? "Usando o token da variável de ambiente TELEGRAM_BOT_TOKEN. Preencher aqui passa a valer no lugar dele."
                : "Crie um bot no @BotFather e cole o token aqui."
          }
        >
          <Input
            name="botToken"
            type="password"
            autoComplete="off"
            placeholder={origemToken === "nenhum" ? "123456:ABC-DEF…" : "•••••••••• (mantém o atual)"}
          />
        </Field>

        <Field
          label="Chat ID"
          hint="Do grupo interno que recebe os alertas. Um cliente pode ter chat próprio no cadastro dele."
        >
          <Input name="chatId" defaultValue={chatId ?? ""} placeholder="-1001234567890" />
        </Field>

        {origemToken === "banco" && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" name="apagarToken" value="true" className="accent-[var(--color-danger)]" />
            Apagar o token salvo
          </label>
        )}
      </div>
    </ActionForm>
  );
}

export function ResumoForm({
  enabled,
  horario,
  porTelegram,
  porEmail,
  incluirSucessos,
}: {
  enabled: boolean;
  horario: string;
  porTelegram: boolean;
  porEmail: boolean;
  incluirSucessos: boolean;
}) {
  return (
    <ActionForm
      action={salvarResumo}
      submitLabel="Salvar resumo"
      successMessage="Configuração do resumo salva."
      extraActions={
        <ActionButton
          action={enviarResumoTeste}
          label="Enviar agora"
          pendingLabel="Montando e enviando…"
          variant="secondary"
        />
      }
    >
      <div className="space-y-5">
        <SwitchField
          name="enabled"
          label="Enviar resumo diário"
          hint="Um panorama das últimas 24h: máquinas, jobs, execuções e o que está aberto."
          defaultChecked={enabled}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Horário" hint="No fuso da aplicação (America/Sao_Paulo).">
            <Input name="horario" type="time" defaultValue={horario} />
          </Field>

          <Field label="Conteúdo">
            <Select name="incluirSucessos" defaultValue={String(incluirSucessos)}>
              <option value="true">Com os que rodaram bem</option>
              <option value="false">Só o que precisa de atenção</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-2">
          <SwitchField name="porTelegram" label="Enviar pelo Telegram" defaultChecked={porTelegram} />
          <SwitchField
            name="porEmail"
            label="Enviar por e-mail"
            hint="Exige o SMTP configurado na aba E-mail."
            defaultChecked={porEmail}
          />
        </div>

        <p className="text-xs text-[var(--color-muted)]">
          Se o worker estiver fora do ar no horário exato, o resumo sai no próximo ciclo do dia —
          atrasado é melhor que nenhum. <Badge tone="neutral">uma vez por dia</Badge>
        </p>
      </div>
    </ActionForm>
  );
}

export function ExecucaoForm({
  enabled,
  escopo,
  porTelegram,
  porEmail,
}: {
  enabled: boolean;
  escopo: "TODAS" | "SOMENTE_SUCESSO" | "SOMENTE_FALHAS";
  porTelegram: boolean;
  porEmail: boolean;
}) {
  return (
    <ActionForm
      action={salvarExecucao}
      submitLabel="Salvar avisos"
      successMessage="Configuração salva. Vale para as próximas execuções."
    >
      <div className="space-y-5">
        <SwitchField
          name="enabled"
          label="Avisar a cada backup concluído"
          hint="Uma mensagem por execução, nomeando o cliente — serve para saber que o backup daquele horário aconteceu."
          defaultChecked={enabled}
        />

        <Field
          label="Quais execuções"
          hint="Erros e atrasos já geram alerta próprio. Se você quer só a confirmação de que rodou, escolha somente as bem-sucedidas para não receber duas mensagens do mesmo problema."
        >
          <Select name="escopo" defaultValue={escopo}>
            <option value="TODAS">Todas as execuções</option>
            <option value="SOMENTE_SUCESSO">Somente as bem-sucedidas</option>
            <option value="SOMENTE_FALHAS">Somente as que deram warning ou erro</option>
          </Select>
        </Field>

        <div className="space-y-2">
          <SwitchField name="porTelegram" label="Enviar pelo Telegram" defaultChecked={porTelegram} />
          <SwitchField
            name="porEmail"
            label="Enviar por e-mail"
            hint="Exige o SMTP configurado na aba E-mail."
            defaultChecked={porEmail}
          />
        </div>

        <p className="text-xs text-[var(--color-muted)]">
          A mensagem sai em até 1 minuto depois que o relatório chega: a ingestão responde na hora
          ao Duplicati e o envio fica por conta do worker, para um canal lento nunca virar timeout
          do lado do cliente.
        </p>
      </div>
    </ActionForm>
  );
}
