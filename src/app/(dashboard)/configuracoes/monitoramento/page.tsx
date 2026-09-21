import { getSettings } from "@/lib/config/settings";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { LimiaresForm } from "./form";

export const dynamic = "force-dynamic";

export default async function MonitoramentoPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Limiares do monitoramento</CardTitle>
        </CardHeader>
        <CardBody>
          <LimiaresForm settings={settings} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O que cada número faz</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-[var(--color-muted)]">
          <p>
            <strong className="text-[var(--color-fg)]">Online / ociosa</strong> — derivados do último
            contato com o Tailscale. Acima do limite de ociosa, a máquina conta como offline.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">Alerta de offline</strong> — quanto tempo sem
            contato antes de virar incidente. Manter acima do limite de ociosa evita alarme por
            reinício de máquina.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">Padrões de job</strong> — valem para jobs
            recém-descobertos. Jobs já cadastrados mantêm o que você configurou neles.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">Retenção do payload</strong> — 0 significa
            guardar para sempre. O payload bruto é o que permite corrigir o parsing depois e o que
            alimenta o resumo de cada execução; só apague se o banco crescer demais.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
