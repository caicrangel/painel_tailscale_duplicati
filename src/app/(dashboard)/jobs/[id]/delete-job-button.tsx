"use client";

import { ActionButton } from "@/components/action-form";
import { removerJob } from "@/server/jobs-actions";

export function DeleteJobButton({
  id,
  nome,
  execucoes,
}: {
  id: string;
  nome: string;
  execucoes: number;
}) {
  return (
    <ActionButton
      action={() => removerJob(id)}
      label="Remover job"
      variant="ghost"
      size="sm"
      confirmar={
        `Remover o job "${nome}" e as ${execucoes} execução(ões) registradas?\n\n` +
        "Isto não pode ser desfeito. Se o job ainda existir no Duplicati daquela " +
        "máquina, o próximo relatório recria o registro aqui com a configuração padrão."
      }
    />
  );
}
