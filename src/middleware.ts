import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/** Rotas acessíveis sem sessão. Tudo o mais exige login. */
const PUBLICAS = ["/login", "/api/auth", "/api/ingest", "/api/health", "/api/marca"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const logado = Boolean(req.auth?.user);

  if (publica) {
    if (pathname === "/login" && logado) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!logado) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
