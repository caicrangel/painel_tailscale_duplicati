import { getSmtpConfig } from "@/lib/config/integracoes";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SmtpForm } from "./form";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  await requireRole("ADMIN");
  const smtp = await getSmtpConfig();
  const pronto = smtp.host !== null && smtp.to.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Servidor SMTP</CardTitle>
          <Badge tone={smtp.enabled && pronto ? "ok" : pronto ? "neutral" : "warn"} dot>
            {smtp.enabled && pronto ? "ativo" : pronto ? "configurado, desligado" : "incompleto"}
          </Badge>
        </CardHeader>
        <CardBody>
          <SmtpForm
            enabled={smtp.enabled}
            host={smtp.host}
            port={smtp.port}
            secure={smtp.secure}
            user={smtp.user}
            from={smtp.from}
            to={smtp.to}
            senhaConfigurada={smtp.senhaConfigurada}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portas e criptografia</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-[var(--color-muted)]">
          <p>
            <strong className="text-[var(--color-fg)]">587</strong> com &quot;conexão segura&quot;
            desligada é o caso mais comum: a conexão começa em claro e sobe para TLS (STARTTLS).
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">465</strong> exige a opção ligada — o TLS vale
            desde o primeiro byte.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">25</strong> costuma ser bloqueada por
            provedores. Evite.
          </p>
          <p className="border-t border-[var(--color-border)] pt-3 text-xs">
            A senha é guardada cifrada no banco e nunca volta para a tela. Para trocá-la, escreva a
            nova; para mantê-la, deixe o campo em branco.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
