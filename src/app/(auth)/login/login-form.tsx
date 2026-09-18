"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const destino = params.get("next") ?? "/dashboard";
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={destino} />

      <Field label="E-mail">
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="voce@empresa.com.br"
        />
      </Field>

      <Field label="Senha">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
