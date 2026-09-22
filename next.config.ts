import type { NextConfig } from "next";

/**
 * Origens aceitas nas Server Actions.
 *
 * O curinga que estava aqui desligava a checagem de origem do Next. O cookie de
 * sessão é SameSite=Lax, então o CSRF continuava barrado na prática — mas era
 * uma camada de defesa a menos, e ela é de graça: o painel é alcançado por um
 * punhado de endereços conhecidos da tailnet.
 *
 * A lista sai de APP_BASE_URL mais o que estiver em SERVER_ACTIONS_ORIGINS
 * (separado por vírgula), para quem alcança o painel por IP e por MagicDNS.
 */
function origensPermitidas(): string[] {
  const origens = new Set<string>();

  const base = process.env.APP_BASE_URL?.trim();
  if (base) {
    try {
      origens.add(new URL(base).host);
    } catch {
      // APP_BASE_URL malformada não pode derrubar o build; a lista extra cobre.
    }
  }

  for (const extra of (process.env.SERVER_ACTIONS_ORIGINS ?? "").split(",")) {
    const limpo = extra.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (limpo) origens.add(limpo);
  }

  return [...origens];
}

const origens = origensPermitidas();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Lista vazia = só a própria origem, que é o default do Next.
    ...(origens.length > 0 ? { serverActions: { allowedOrigins: origens } } : {}),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // O painel nunca é legitimamente embutido em outra página.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Endereço da tailnet não vaza no Referer ao clicar em link externo.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
