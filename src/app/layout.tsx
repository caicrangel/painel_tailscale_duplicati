import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

export const metadata: Metadata = {
  title: "Painel de Monitoramento",
  description: "Monitoramento centralizado de infraestrutura e backups",
  icons: { icon: "/favicon.svg" },
};

// viewport-fit=cover libera o env(safe-area-inset-*): sem ele a barra de abas
// do celular fica atrás do indicador de gestos do iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
