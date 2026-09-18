import { requireRole } from "@/lib/auth/guards";
import { criarCliente } from "@/server/clients-actions";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../client-form";

export const metadata = { title: "Novo cliente · Painel" };

export default async function NovoClientePage() {
  await requireRole("OPERATOR");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo cliente"
        subtitle="Um token de ingestão é gerado automaticamente para as máquinas deste cliente."
      />
      <Card>
        <CardBody>
          <ClientForm action={criarCliente} submitLabel="Criar cliente" />
        </CardBody>
      </Card>
    </div>
  );
}
