import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getAparencia } from "@/lib/config/aparencia";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Selo de alertas abertos no menu: no celular é o primeiro sinal de que algo
  // precisa de atenção, antes mesmo de abrir o dashboard.
  const [abertos, criticos, aparencia] = await Promise.all([
    prisma.alert.count({ where: { closedAt: null } }),
    prisma.alert.count({ where: { closedAt: null, severity: "CRITICAL" } }),
    getAparencia(),
  ]);
  const marca = {
    nome: aparencia.nome,
    subtitulo: aparencia.subtitulo,
    logos: aparencia.logos,
    mostrarNome: aparencia.mostrarNome,
  };

  return (
    <AppShell user={user} alertas={{ abertos, criticos }} marca={marca}>
      {children}
    </AppShell>
  );
}
