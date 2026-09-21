"use client";

import { ActionButton, ActionForm } from "@/components/action-form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import { salvarSmtp, testarSmtp } from "@/server/settings-actions";

export function SmtpForm({
  enabled,
  host,
  port,
  secure,
  user,
  from,
  to,
  senhaConfigurada,
}: {
  enabled: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  from: string | null;
  to: string[];
  senhaConfigurada: boolean;
}) {
  return (
    <ActionForm
      action={salvarSmtp}
      submitLabel="Salvar"
      successMessage="Configuração de e-mail salva."
      extraActions={
        <ActionButton
          action={testarSmtp}
          label="Enviar teste"
          pendingLabel="Enviando…"
          variant="secondary"
        />
      }
    >
      <div className="space-y-5">
        <SwitchField
          name="enabled"
          label="Enviar alertas por e-mail"
          hint="Funciona junto com o Telegram: com os dois ligados, cada incidente vai pelos dois canais."
          defaultChecked={enabled}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Servidor">
              <Input name="host" defaultValue={host ?? ""} placeholder="smtp.suaempresa.com.br" />
            </Field>
          </div>
          <Field label="Porta">
            <Input name="port" type="number" min={1} max={65535} defaultValue={port} />
          </Field>
        </div>

        <SwitchField
          name="secure"
          label="Conexão segura desde o início (porta 465)"
          hint="Deixe desligado na porta 587, que usa STARTTLS."
          defaultChecked={secure}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuário" hint="Em branco se o servidor não exige autenticação.">
            <Input name="user" defaultValue={user ?? ""} autoComplete="off" />
          </Field>

          <Field
            label="Senha"
            hint={senhaConfigurada ? "Uma senha já está salva. Em branco mantém a atual." : undefined}
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={senhaConfigurada ? "•••••••••• (mantém a atual)" : ""}
            />
          </Field>
        </div>

        <Field label="Remetente" hint="Endereço que aparece no 'de'.">
          <Input name="from" type="email" defaultValue={from ?? ""} placeholder="painel@suaempresa.com.br" />
        </Field>

        <Field
          label="Destinatários"
          hint="Um por linha, ou separados por vírgula. São quem recebe os alertas."
        >
          <Textarea name="to" rows={3} defaultValue={to.join("\n")} placeholder="ti@suaempresa.com.br" />
        </Field>

        {senhaConfigurada && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" name="apagarSenha" value="true" className="accent-[var(--color-danger)]" />
            Apagar a senha salva
          </label>
        )}
      </div>
    </ActionForm>
  );
}
