import { cache } from "react";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { TIPOS_LOGO, type TipoLogo } from "@/lib/aparencia/logo";

/**
 * Aparência do painel: nome, logos (um por tema), cor de destaque e tema
 * padrão. Mesma tabela `settings` das integrações, sem migration.
 *
 * Os logos ficam em chaves próprias: a configuração principal é lida em toda
 * página, e carregar 2×256 KB de imagem a cada request só para saber o nome
 * do painel seria desperdício. A página referencia o logo por URL versionada
 * (/api/marca/logo/claro?v=hash), e o navegador guarda em cache para sempre.
 */

const CHAVE = "aparencia";
const chaveLogo = (v: VarianteLogo) => `aparencia.logo.${v}`;

export const VARIANTES_LOGO = ["claro", "escuro"] as const;
export type VarianteLogo = (typeof VARIANTES_LOGO)[number];
export type TemaPadrao = "system" | "light" | "dark";
export const ALINHAMENTOS_LOGO = ["esquerda", "centro", "direita"] as const;
export type AlinhamentoLogo = (typeof ALINHAMENTOS_LOGO)[number];

export const NOME_PADRAO = "Painel";
export const SUBTITULO_PADRAO = "Infra & Backups";

/** Altura do logo em px. Limites largos, mas que não quebram o menu nem o login. */
export const TAMANHO_LOGO = {
  menu: { min: 24, max: 72, padrao: 36 },
  login: { min: 40, max: 200, padrao: 64 },
} as const;

const armazenado = z.object({
  /** Vazio é válido: quem tem o nome no logo pode dispensar o texto. */
  nome: z.string().trim().max(40).catch(NOME_PADRAO),
  subtitulo: z.string().trim().max(60).catch(SUBTITULO_PADRAO),
  corDestaque: z.string().regex(/^#[0-9a-f]{6}$/).nullable().catch(null),
  temaPadrao: z.enum(["system", "light", "dark"]).catch("system"),
  /** Desligado, o logo (um logotipo com o nome escrito) ocupa o lugar do texto. */
  mostrarNome: z.boolean().catch(true),
  tamanhoLogoMenu: z.number().int().min(TAMANHO_LOGO.menu.min).max(TAMANHO_LOGO.menu.max).catch(TAMANHO_LOGO.menu.padrao),
  alinhamentoLogo: z.enum(ALINHAMENTOS_LOGO).catch("esquerda"),
  tamanhoLogoLogin: z.number().int().min(TAMANHO_LOGO.login.min).max(TAMANHO_LOGO.login.max).catch(TAMANHO_LOGO.login.padrao),
  /** Versão (hash curto) de cada logo; nulo = sem logo daquela variante. */
  logos: z
    .object({ claro: z.string().nullable().catch(null), escuro: z.string().nullable().catch(null) })
    .catch({ claro: null, escuro: null }),
});

const logoArmazenado = z.object({
  tipo: z.enum(TIPOS_LOGO),
  base64: z.string(),
});

export type Aparencia = {
  nome: string;
  subtitulo: string;
  corDestaque: string | null;
  temaPadrao: TemaPadrao;
  mostrarNome: boolean;
  tamanhoLogoMenu: number;
  tamanhoLogoLogin: number;
  /** Posição do logo no cabeçalho do menu. */
  alinhamentoLogo: AlinhamentoLogo;
  /** URL de cada variante, já resolvida: a que falta cai na outra. Nulo = sem logo nenhum. */
  logos: { claro: string; escuro: string } | null;
  /** O que foi de fato enviado, para a tela de configuração. */
  logosEnviados: { claro: boolean; escuro: boolean };
};

function padrao(): z.infer<typeof armazenado> {
  return {
    nome: NOME_PADRAO,
    subtitulo: SUBTITULO_PADRAO,
    corDestaque: null,
    temaPadrao: "system",
    mostrarNome: true,
    tamanhoLogoMenu: TAMANHO_LOGO.menu.padrao,
    tamanhoLogoLogin: TAMANHO_LOGO.login.padrao,
    alinhamentoLogo: "esquerda",
    logos: { claro: null, escuro: null },
  };
}

async function lerArmazenado() {
  let linha;
  try {
    linha = await prisma.setting.findUnique({ where: { key: CHAVE } });
  } catch (erro) {
    // O layout raiz lê daqui em toda página, inclusive no `next build` sem
    // banco e na tela de erro. Aparência nunca pode ser o motivo de a página
    // não abrir: cai no padrão.
    console.error("[aparencia] leitura falhou, usando o padrão", erro);
    return padrao();
  }
  if (!linha) return padrao();
  const r = armazenado.safeParse(linha.value);
  return r.success ? r.data : padrao();
}

/** Uma leitura por request, mesmo com layout, página e metadata pedindo. */
export const getAparencia = cache(async (): Promise<Aparencia> => {
  const a = await lerArmazenado();
  const url = (v: VarianteLogo) => `/api/marca/logo/${v}?v=${a.logos[v]}`;

  const claro = a.logos.claro ? url("claro") : a.logos.escuro ? url("escuro") : null;
  const escuro = a.logos.escuro ? url("escuro") : a.logos.claro ? url("claro") : null;

  return {
    nome: a.nome,
    subtitulo: a.subtitulo,
    corDestaque: a.corDestaque,
    temaPadrao: a.temaPadrao,
    mostrarNome: a.mostrarNome,
    tamanhoLogoMenu: a.tamanhoLogoMenu,
    tamanhoLogoLogin: a.tamanhoLogoLogin,
    alinhamentoLogo: a.alinhamentoLogo,
    logos: claro && escuro ? { claro, escuro } : null,
    logosEnviados: { claro: a.logos.claro !== null, escuro: a.logos.escuro !== null },
  };
});

export async function getLogo(v: VarianteLogo): Promise<{ tipo: TipoLogo; bytes: Buffer } | null> {
  const linha = await prisma.setting.findUnique({ where: { key: chaveLogo(v) } });
  if (!linha) return null;
  const r = logoArmazenado.safeParse(linha.value);
  return r.success ? { tipo: r.data.tipo, bytes: Buffer.from(r.data.base64, "base64") } : null;
}

export async function salvarAparencia(input: {
  nome: string;
  subtitulo: string;
  corDestaque: string | null;
  temaPadrao: TemaPadrao;
  mostrarNome: boolean;
  tamanhoLogoMenu: number;
  tamanhoLogoLogin: number;
  alinhamentoLogo: AlinhamentoLogo;
  /** Por variante: arquivo novo, "remover", ou ausente para manter. */
  logos: Partial<Record<VarianteLogo, { tipo: TipoLogo; bytes: Uint8Array } | "remover">>;
}): Promise<void> {
  const atual = await lerArmazenado();
  const versoes = { ...atual.logos };

  await prisma.$transaction(async (tx) => {
    for (const v of VARIANTES_LOGO) {
      const mudanca = input.logos[v];
      if (mudanca === undefined) continue;

      if (mudanca === "remover") {
        await tx.setting.deleteMany({ where: { key: chaveLogo(v) } });
        versoes[v] = null;
        continue;
      }

      const valor = { tipo: mudanca.tipo, base64: Buffer.from(mudanca.bytes).toString("base64") };
      await tx.setting.upsert({
        where: { key: chaveLogo(v) },
        create: { key: chaveLogo(v), value: valor },
        update: { value: valor },
      });
      // Hash do conteúdo: logo novo = URL nova, e o cache "para sempre" do
      // navegador nunca serve o antigo.
      versoes[v] = createHash("sha256").update(mudanca.bytes).digest("hex").slice(0, 12);
    }

    const valor = {
      nome: input.nome,
      subtitulo: input.subtitulo,
      corDestaque: input.corDestaque,
      temaPadrao: input.temaPadrao,
      mostrarNome: input.mostrarNome,
      tamanhoLogoMenu: input.tamanhoLogoMenu,
      tamanhoLogoLogin: input.tamanhoLogoLogin,
      alinhamentoLogo: input.alinhamentoLogo,
      logos: versoes,
    };
    await tx.setting.upsert({
      where: { key: CHAVE },
      create: { key: CHAVE, value: valor },
      update: { value: valor },
    });
  });
}
