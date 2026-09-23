import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getAparencia } from "@/lib/config/aparencia";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Selo do menu: conta só o que ninguém marcou como ciente. Quem reconheceu
  // um alerta já sabe dele — o selo fica para o que ainda pede atenção. O
  // incidente continua aberto no dashboard e na tela de Alertas até resolver.
  const [abertos, criticos, aparencia] = await Promise.all([
    prisma.alert.count({ where: { closedAt: null, acknowledgedAt: null } }),
    prisma.alert.count({ where: { closedAt: null, acknowledgedAt: null, severity: "CRITICAL" } }),
    getAparencia(),
  ]);
  const marca = {
    nome: aparencia.nome,
    subtitulo: aparencia.subtitulo,
    logos: aparencia.logos,
    mostrarNome: aparencia.mostrarNome,
    tamanhoLogo: aparencia.tamanhoLogoMenu,
    alinhamento: aparencia.alinhamentoLogo,
  };

  return (
    <AppShell user={user} alertas={{ abertos, criticos }} marca={marca}>
      {children}
    </AppShell>
  );
}
