import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { ConfigTabs } from "./tabs";

export const metadata = { title: "Configurações · Painel" };

/**
 * As configurações são organizadas por tecnologia: cada integração tem sua
 * aba, com tudo o que ela precisa no mesmo lugar. Integração nova = aba nova,
 * sem mexer nas outras.
 */
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Integrações e parâmetros do monitoramento. Acesso restrito a administradores."
      />
      <ConfigTabs />
      <div className="mt-5">{children}</div>
    </div>
  );
}
