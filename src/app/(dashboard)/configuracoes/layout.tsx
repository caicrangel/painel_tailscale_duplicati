import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { ConfigTabs } from "./tabs";

// Sem título aqui: um título fixo no layout cortaria o modelo "Página · Nome do
// painel" do layout raiz. Cada aba define o seu.

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
