import { requireRole } from "@/lib/auth/guards";
import { getAparencia } from "@/lib/config/aparencia";
import { AparenciaForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aparência · Configurações" };

export default async function AparenciaPage() {
  await requireRole("ADMIN");
  const a = await getAparencia();

  return (
    <AparenciaForm
      nome={a.nome}
      subtitulo={a.subtitulo}
      corDestaque={a.corDestaque}
      temaPadrao={a.temaPadrao}
      mostrarNome={a.mostrarNome}
      logos={{
        claro: a.logosEnviados.claro ? (a.logos?.claro ?? null) : null,
        escuro: a.logosEnviados.escuro ? (a.logos?.escuro ?? null) : null,
      }}
    />
  );
}
