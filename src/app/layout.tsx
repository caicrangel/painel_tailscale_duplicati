import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { getAparencia } from "@/lib/config/aparencia";
import { cssDaPaleta, derivarPaleta } from "@/lib/aparencia/paleta";

export async function generateMetadata(): Promise<Metadata> {
  const a = await getAparencia();
  return {
    title: { default: a.nome, template: `%s · ${a.nome}` },
    description: "Monitoramento centralizado de infraestrutura e backups",
    // A aba do navegador segue o tema do sistema operacional, não o do painel:
    // é o `prefers-color-scheme` que decide qual logo aparece nela.
    icons: a.logos
      ? {
          icon: [
            { url: a.logos.claro, media: "(prefers-color-scheme: light)" },
            { url: a.logos.escuro, media: "(prefers-color-scheme: dark)" },
          ],
          apple: a.logos.claro,
        }
      : { icon: "/favicon.svg" },
  };
}

// viewport-fit=cover libera o env(safe-area-inset-*): sem ele a barra de abas
// do celular fica atrás do indicador de gestos do iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A aparência vem do banco: nenhuma página pode ser congelada no build.
  await connection();
  const a = await getAparencia();

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript temaPadrao={a.temaPadrao} />
        {a.corDestaque && (
          // Seguro: cssDaPaleta só emite hex validado e recusa qualquer outra coisa.
          <style dangerouslySetInnerHTML={{ __html: cssDaPaleta(derivarPaleta(a.corDestaque)) }} />
        )}
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
