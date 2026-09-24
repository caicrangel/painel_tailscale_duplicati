"use client";

import { ActionButton } from "@/components/action-form";
import { reenviarNotificacoesFalhas } from "@/server/sistema-actions";

export function ReenviarButton() {
  return (
    <ActionButton
      action={reenviarNotificacoesFalhas}
      label="Reenviar"
      pendingLabel="Recolocando na fila…"
      confirmar="Recolocar na fila as notificações que falharam nos últimos 7 dias?"
      size="sm"
    />
  );
}
