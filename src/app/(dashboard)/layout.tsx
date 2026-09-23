import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Selo de alertas abertos no menu: no celular é o primeiro sinal de que algo
  // precisa de atenção, antes mesmo de abrir o dashboard.
  const [abertos, criticos] = await Promise.all([
    prisma.alert.count({ where: { closedAt: null } }),
    prisma.alert.count({ where: { closedAt: null, severity: "CRITICAL" } }),
  ]);

  return (
    <AppShell user={user} alertas={{ abertos, criticos }}>
      {children}
    </AppShell>
  );
}
