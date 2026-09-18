"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { atualizarJob } from "@/server/jobs-actions";

const INTERVALOS = [
  { value: 60, label: "A cada hora" },
  { value: 360, label: "A cada 6 horas" },
  { value: 720, label: "A cada 12 horas" },
  { value: 1440, label: "Diário" },
  { value: 10080, label: "Semanal" },
];

export function JobForm({
  job,
}: {
  job: {
    id: string;
    name: string;
    expectedIntervalMinutes: number;
    toleranceMinutes: number;
    destinationHint: string | null;
    active: boolean;
    paused: boolean;
  };
}) {
  const intervaloConhecido = INTERVALOS.some((i) => i.value === job.expectedIntervalMinutes);

  return (
    <ActionForm
      action={atualizarJob.bind(null, job.id)}
      submitLabel="Salvar"
      successMessage="Job atualizado — o status de atraso já foi recalculado."
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input name="name" defaultValue={job.name} required />
        </Field>

        <Field
          label="Frequência esperada"
          hint="É o que define quando o job passa a ser considerado atrasado."
        >
          <Select name="expectedIntervalMinutes" defaultValue={String(job.expectedIntervalMinutes)}>
            {!intervaloConhecido && (
              <option value={job.expectedIntervalMinutes}>
                {job.expectedIntervalMinutes} minutos (personalizado)
              </option>
            )}
            {INTERVALOS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Tolerância (minutos)"
          hint="Folga além da frequência antes de alertar. Ex.: 360 = 6 horas."
        >
          <Input
            name="toleranceMinutes"
            type="number"
            min={0}
            step={30}
            defaultValue={job.toleranceMinutes}
            required
          />
        </Field>

        <Field label="Destino (anotação)">
          <Input
            name="destinationHint"
            defaultValue={job.destinationHint ?? ""}
            placeholder="ex.: S3 bucket-cliente-x"
          />
        </Field>

        <Field label="Monitoramento">
          <Select name="paused" defaultValue={String(job.paused)}>
            <option value="false">Ativo — avalia atraso e gera alerta</option>
            <option value="true">Pausado — não alerta</option>
          </Select>
        </Field>

        <input type="hidden" name="active" value={String(job.active)} />
      </div>
    </ActionForm>
  );
}
