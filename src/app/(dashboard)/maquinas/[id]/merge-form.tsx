"use client";

import { useState } from "react";
import { Merge } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { mesclarMaquinas } from "@/server/machines-actions";

/**
 * Aparece só em máquinas criadas pela ingestão do Duplicati (sem device do
 * Tailscale). É a saída para o caso em que o mesmo servidor aparece duas
 * vezes porque o Duplicati o chama por um nome e o Tailscale por outro.
 */
export function MergeForm({
  machineId,
  hostname,
  devices,
}: {
  machineId: string;
  hostname: string;
  devices: { id: string; rotulo: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("");

  if (devices.length === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Esta máquina veio de um relatório do Duplicati e ainda não está associada a um device do
        Tailscale. Assim que o worker sincronizar os devices, dá para uni-las aqui.
      </p>
    );
  }

  if (!aberto) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-muted)]">
          Esta máquina foi criada a partir de um relatório do Duplicati e não tem status de rede.
          Se ela é, na verdade, um device que já existe no Tailscale, una as duas.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
          <Merge className="size-4" />
          Unir a um device do Tailscale
        </Button>
      </div>
    );
  }

  return (
    <ActionForm
      action={async () => {
        if (!destino) return { ok: false as const, error: "Escolha o device do Tailscale." };
        return mesclarMaquinas(machineId, destino);
      }}
      submitLabel="Unir máquinas"
      pendingLabel="Unindo…"
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
      <Field
        label="Device do Tailscale correspondente"
        hint={`Os jobs de "${hostname}" passam para o device escolhido, e "${hostname}" fica registrado como apelido — é isso que impede a duplicata de voltar no próximo backup.`}
      >
        <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">— escolha o device —</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.rotulo}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}
