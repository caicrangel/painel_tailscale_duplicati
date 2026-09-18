"use client";

import Link from "next/link";
import type { Client } from "@prisma/client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

const PLANOS = [
  { value: "ESSENCIAL", label: "Essencial" },
  { value: "PROFISSIONAL", label: "Profissional" },
  { value: "CORPORATIVO", label: "Corporativo" },
];

export function ClientForm({
  cliente,
  action,
  submitLabel,
}: {
  cliente?: Client;
  action: (fd: FormData) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  submitLabel: string;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      extraActions={
        <Link
          href="/clientes"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          Cancelar
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nome do cliente">
            <Input name="name" defaultValue={cliente?.name} required maxLength={120} />
          </Field>
        </div>

        <Field label="Plano">
          <Select name="plan" defaultValue={cliente?.plan ?? "ESSENCIAL"}>
            {PLANOS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Situação">
          <Select name="active" defaultValue={String(cliente?.active ?? true)}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </Field>

        <Field label="Contato — nome">
          <Input name="contactName" defaultValue={cliente?.contactName ?? ""} />
        </Field>

        <Field label="Contato — e-mail">
          <Input name="contactEmail" type="email" defaultValue={cliente?.contactEmail ?? ""} />
        </Field>

        <Field label="Contato — telefone">
          <Input name="contactPhone" defaultValue={cliente?.contactPhone ?? ""} />
        </Field>

        <Field
          label="Telegram chat ID (opcional)"
          hint="Vazio = usa o chat global configurado no .env."
        >
          <Input name="telegramChatId" defaultValue={cliente?.telegramChatId ?? ""} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Observações">
            <Textarea name="notes" rows={3} defaultValue={cliente?.notes ?? ""} />
          </Field>
        </div>
      </div>
    </ActionForm>
  );
}
