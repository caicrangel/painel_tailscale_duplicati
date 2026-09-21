"use client";

import type { AppSettings } from "@/lib/config/settings";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import { salvarLimiares } from "@/server/settings-actions";

export function LimiaresForm({ settings }: { settings: AppSettings }) {
  return (
    <ActionForm
      action={salvarLimiares}
      submitLabel="Salvar limiares"
      successMessage="Limiares atualizados. Valem no próximo ciclo do worker."
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Online até (min)" hint="Contato mais recente que isto = online.">
            <Input
              name="machineOnlineMaxMinutes"
              type="number"
              min={1}
              defaultValue={settings.machineOnlineMaxMinutes}
            />
          </Field>
          <Field label="Ociosa até (min)" hint="Acima disto, offline.">
            <Input
              name="machineIdleMaxMinutes"
              type="number"
              min={2}
              defaultValue={settings.machineIdleMaxMinutes}
            />
          </Field>
          <Field
            label="Alertar offline após (min)"
            hint="Independe dos dois campos ao lado: conta o tempo sem contato."
          >
            <Input
              name="machineOfflineAlertMinutes"
              type="number"
              min={1}
              defaultValue={settings.machineOfflineAlertMinutes}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Frequência padrão (min)" hint="1440 = diário.">
            <Input
              name="defaultJobIntervalMinutes"
              type="number"
              min={5}
              defaultValue={settings.defaultJobIntervalMinutes}
            />
          </Field>
          <Field label="Tolerância padrão (min)" hint="360 = 6 horas.">
            <Input
              name="defaultJobToleranceMinutes"
              type="number"
              min={0}
              defaultValue={settings.defaultJobToleranceMinutes}
            />
          </Field>
          <Field label="Retenção do payload (dias)" hint="0 = nunca apagar.">
            <Input
              name="rawPayloadRetentionDays"
              type="number"
              min={0}
              defaultValue={settings.rawPayloadRetentionDays}
            />
          </Field>
        </div>

        <SwitchField
          name="alertOnWarning"
          label="Alertar também quando o backup termina com warning"
          hint="Desligado por padrão: warning costuma ser arquivo em uso, e alerta demais vira ruído."
          defaultChecked={settings.alertOnWarning}
        />
      </div>
    </ActionForm>
  );
}
