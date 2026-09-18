"use client";

import { ActionButton } from "@/components/action-form";
import { reconhecerAlerta } from "@/server/alerts-actions";

export function AcknowledgeButton({ id }: { id: string }) {
  return (
    <ActionButton
      action={() => reconhecerAlerta(id)}
      label="Reconhecer"
      variant="ghost"
      size="sm"
    />
  );
}
