"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  atualizarUsuario,
  criarUsuario,
  redefinirSenha,
  removerUsuario,
} from "@/server/users-actions";
import { ROLE_LABEL } from "@/lib/auth/roles";

const PAPEIS: { value: Role; label: string; hint: string }[] = [
  { value: "ADMIN", label: ROLE_LABEL.ADMIN, hint: "tudo, inclusive usuários e tokens" },
  { value: "OPERATOR", label: ROLE_LABEL.OPERATOR, hint: "edita clientes, máquinas e jobs" },
  { value: "VIEWER", label: ROLE_LABEL.VIEWER, hint: "somente leitura, sem token de ingestão" },
];

export function NovoUsuarioForm() {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return <Button onClick={() => setAberto(true)}>Novo usuário</Button>;
  }

  return (
    <ActionForm
      action={criarUsuario}
      submitLabel="Criar usuário"
      successMessage="Usuário criado."
      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      extraActions={
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          Cancelar
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input name="name" required />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Papel">
          <Select name="role" defaultValue="VIEWER">
            {PAPEIS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 12 caracteres, com letra e número.">
          <Input name="password" type="password" required autoComplete="new-password" />
        </Field>
      </div>
    </ActionForm>
  );
}

export function LinhaUsuario({
  usuario,
  souEu,
}: {
  usuario: { id: string; name: string; email: string; role: Role; active: boolean };
  souEu: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  if (editando) {
    return (
      <ActionForm
        action={atualizarUsuario.bind(null, usuario.id)}
        submitLabel="Salvar"
        successMessage="Usuário atualizado."
        className="p-4"
        extraActions={
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          >
            Cancelar
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Nome">
            <Input name="name" defaultValue={usuario.name} required />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" defaultValue={usuario.email} required />
          </Field>
          <Field label="Papel">
            <Select name="role" defaultValue={usuario.role}>
              {PAPEIS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select name="active" defaultValue={String(usuario.active)}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
          </Field>
        </div>
      </ActionForm>
    );
  }

  if (trocandoSenha) {
    return (
      <ActionForm
        action={redefinirSenha.bind(null, usuario.id)}
        submitLabel="Redefinir senha"
        successMessage="Senha redefinida."
        className="p-4"
        extraActions={
          <button
            type="button"
            onClick={() => setTrocandoSenha(false)}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          >
            Cancelar
          </button>
        }
      >
        <Field label={`Nova senha de ${usuario.name}`} hint="Mínimo de 12 caracteres.">
          <Input name="password" type="password" required autoComplete="new-password" />
        </Field>
      </ActionForm>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
        Editar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setTrocandoSenha(true)}>
        Senha
      </Button>
      {!souEu && (
        <ActionButton
          action={() => removerUsuario(usuario.id)}
          label="Remover"
          variant="ghost"
          size="sm"
          confirmar={`Remover ${usuario.email}? Esta ação não pode ser desfeita.`}
        />
      )}
    </div>
  );
}
