import { NextResponse } from "next/server";
import { getLogo, VARIANTES_LOGO, type VarianteLogo } from "@/lib/config/aparencia";

export const dynamic = "force-dynamic";

/**
 * Serve o logo. Pública: a tela de login mostra o logo antes de haver sessão,
 * e um logo não é segredo.
 *
 * A URL leva ?v=<hash do conteúdo>, então o cache pode ser eterno. O CSP
 * sandbox é a segunda trava contra SVG malicioso (a primeira é a validação no
 * upload): mesmo aberto direto no navegador, nada ali executa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ variante: string }> }) {
  const { variante } = await params;
  if (!VARIANTES_LOGO.includes(variante as VarianteLogo)) {
    return new NextResponse(null, { status: 404 });
  }

  const logo = await getLogo(variante as VarianteLogo);
  if (!logo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
