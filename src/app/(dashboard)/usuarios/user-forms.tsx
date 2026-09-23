"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import type { Role } from "@prisma/client";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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

function CamposDoPapel({ defaultValue }: { defaultValue: Role }) {
  return (
    <Field label="Papel">
      <Select name="role" defaultValue={defaultValue}>
        {PAPEIS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label} — {p.hint}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function NovoUsuarioForm() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" />
        Novo usuário
      </Button>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Novo usuário"
        descricao="A pessoa entra com este e-mail e a senha inicial, e pode trocá-la depois."
        largura="md"
      >
        <ActionForm
          action={criarUsuario}
          submitLabel="Criar usuário"
          successMessage="Usuário criado."
          onSuccess={() => setAberto(false)}
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
              <Input name="name" required autoFocus />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <CamposDoPapel defaultValue="VIEWER" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Senha inicial" hint="Mínimo de 12 caracteres, com letra e número.">
                <Input name="password" type="password" required autoComplete="new-password" />
              </Field>
            </div>
          </div>
        </ActionForm>
      </Modal>
    </>
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

  return (
    <div className="flex flex-wrap items-center gap-1 md:justify-end">
      <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
        <Pencil className="size-3.5" />
        Editar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setTrocandoSenha(true)}>
        <KeyRound className="size-3.5" />
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

      <Modal
        aberto={editando}
        aoFechar={() => setEditando(false)}
        titulo={`Editar ${usuario.name}`}
        descricao={usuario.email}
        largura="md"
      >
        <ActionForm
          action={atualizarUsuario.bind(null, usuario.id)}
          submitLabel="Salvar"
          successMessage="Usuário atualizado."
          onSuccess={() => setEditando(false)}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input name="name" defaultValue={usuario.name} required />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" defaultValue={usuario.email} required />
            </Field>
            <CamposDoPapel defaultValue={usuario.role} />
            <Field label="Situação">
              <Select name="active" defaultValue={String(usuario.active)}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Select>
            </Field>
          </div>
          {souEu && (
            <p className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
              Este é o seu próprio usuário: o painel não deixa você se rebaixar nem se desativar,
              para ninguém ficar trancado do lado de fora.
            </p>
          )}
        </ActionForm>
      </Modal>

      <Modal
        aberto={trocandoSenha}
        aoFechar={() => setTrocandoSenha(false)}
        titulo="Redefinir senha"
        descricao={`Nova senha de ${usuario.name} (${usuario.email}).`}
        largura="sm"
      >
        <ActionForm
          action={redefinirSenha.bind(null, usuario.id)}
          submitLabel="Redefinir senha"
          successMessage="Senha redefinida."
          onSuccess={() => setTrocandoSenha(false)}
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
          <Field label="Nova senha" hint="Mínimo de 12 caracteres, com letra e número.">
            <Input name="password" type="password" required autoComplete="new-password" autoFocus />
          </Field>
        </ActionForm>
      </Modal>
    </div>
  );
}
