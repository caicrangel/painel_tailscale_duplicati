"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { atribuirMaquina, atualizarMaquina } from "@/server/machines-actions";

export function AssignForm({
  machine,
  clientes,
}: {
  machine: {
    id: string;
    clientId: string | null;
    hostname: string;
    displayName: string | null;
    notes: string | null;
    maintenanceUntil: Date | null;
    source: string;
  };
  clientes: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={atualizarMaquina.bind(null, machine.id)}
      submitLabel="Salvar"
      successMessage="Máquina atualizada."
    >
      <div className="space-y-4">
        <Field
          label="Cliente"
          hint="Vincular é o que faz esta máquina entrar no monitoramento e nos alertas."
        >
          <Select name="clientId" defaultValue={machine.clientId ?? ""}>
            <option value="">— Não atribuída —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Hostname"
          hint={
            machine.source === "TAILSCALE"
              ? "Veio do Tailscale; o próximo sync sobrescreve este campo."
              : undefined
          }
        >
          <Input name="hostname" defaultValue={machine.hostname} required />
        </Field>

        <Field label="Nome de exibição (opcional)">
          <Input name="displayName" defaultValue={machine.displayName ?? ""} />
        </Field>

        <Field
          label="Em manutenção até (opcional)"
          hint="Enquanto estiver em manutenção, a máquina não gera alerta de offline."
        >
          <Input
            name="maintenanceUntil"
            type="datetime-local"
            defaultValue={
              machine.maintenanceUntil
                ? new Date(machine.maintenanceUntil).toISOString().slice(0, 16)
                : ""
            }
          />
        </Field>

        <Field label="Observações">
          <Textarea name="notes" rows={3} defaultValue={machine.notes ?? ""} />
        </Field>
      </div>
    </ActionForm>
  );
}

/** Atalho de uma linha usado na lista de não atribuídas. */
export function QuickAssign({
  machineId,
  clientes,
}: {
  machineId: string;
  clientes: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={atribuirMaquina} submitLabel="Vincular" className="flex items-end gap-2">
      <input type="hidden" name="machineId" value={machineId} />
      <Select name="clientId" className="w-52">
        <option value="">— escolha o cliente —</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </ActionForm>
  );
}
