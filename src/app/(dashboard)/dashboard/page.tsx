import { requireUser } from "@/lib/auth/guards";

export const metadata = { title: "Dashboard · Painel" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Olá, {user.name}. Os painéis de acompanhamento chegam no incremento 8.
      </p>
    </div>
  );
}
