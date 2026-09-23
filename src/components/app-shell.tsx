import type { Role } from "@prisma/client";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import type { ContagemAlertas } from "./navegacao";

export function AppShell({
  user,
  alertas,
  children,
}: {
  user: { name: string; email: string; role: Role };
  alertas: ContagemAlertas;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} alertas={alertas} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} alertas={alertas} />
        {/* No celular, o fundo da página precisa sobrar acima da barra de abas fixa. */}
        <main className="min-w-0 flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
