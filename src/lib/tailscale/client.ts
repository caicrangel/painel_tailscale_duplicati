import { z } from "zod";
import { env } from "@/lib/config/env";

/**
 * Cliente da API do Tailscale.
 *
 * OAuth client credentials com escopo devices:core:read — somente leitura.
 * O access token expira em 1h; mantemos em memória do processo, com renovação
 * automática antes do vencimento. Não persistimos token em banco.
 */

const TOKEN_URL = "https://api.tailscale.com/api/v2/oauth/token";
const API_BASE = "https://api.tailscale.com/api/v2";
const TIMEOUT_MS = 15_000;
/** Falha de rede é transitória com frequência: tenta de novo antes de cegar o ciclo. */
const TENTATIVAS = 3;
const BACKOFF_MS = [1_000, 3_000];
/** Renova com folga para não usar um token que expira no meio da chamada. */
const MARGEM_RENOVACAO_MS = 5 * 60_000;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

/**
 * Schema tolerante: campos desconhecidos passam, campos conhecidos são
 * opcionais. A API pode ganhar campos novos e não pode quebrar o sync.
 */
const deviceSchema = z
  .object({
    id: z.string(),
    nodeId: z.string().optional(),
    name: z.string().optional(),
    hostname: z.string().optional(),
    os: z.string().optional(),
    clientVersion: z.string().optional(),
    updateAvailable: z.boolean().optional(),
    lastSeen: z.string().optional(),
    addresses: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    user: z.string().optional(),
    created: z.string().optional(),
    authorized: z.boolean().optional(),
  })
  .passthrough();

export type TailscaleDevice = z.infer<typeof deviceSchema>;

const devicesSchema = z.object({ devices: z.array(z.unknown()).default([]) });

export class TailscaleError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TailscaleError";
  }
}

let cache: { token: string; expiraEm: number } | null = null;

/** Só para teste e para forçar renovação após erro 401. */
export function limparTokenCache() {
  cache = null;
}

/**
 * `fetch failed` do Node não diz nada: o motivo real (DNS, TLS, recusa de
 * conexão) mora em `cause`, possivelmente aninhado. Sem desempacotar isso, o
 * log do worker e o aviso do painel mandam o operador olhar no escuro.
 */
export function descreverCausa(erro: unknown): string {
  const partes: string[] = [];
  let atual: unknown = erro;

  for (let i = 0; i < 5 && atual instanceof Error; i += 1) {
    const campos = atual as Error & {
      code?: string;
      syscall?: string;
      hostname?: string;
      errors?: unknown[];
    };
    const detalhe = [campos.code, campos.syscall, campos.hostname]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
    const texto = detalhe ? `${atual.message} (${detalhe})` : atual.message;
    if (texto && !partes.includes(texto)) partes.push(texto);

    if (Array.isArray(campos.errors) && campos.errors.length > 0) {
      atual = campos.errors[0];
      continue;
    }
    atual = atual.cause;
  }

  if (partes.length === 0) return String(erro);
  return partes.join(" ← ");
}

function ehAbort(erro: unknown): boolean {
  return erro instanceof Error && erro.name === "AbortError";
}

async function fetchComTimeout(url: string, init: RequestInit): Promise<Response> {
  let ultimo: unknown;

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (erro) {
      ultimo = erro;
      const espera = BACKOFF_MS[tentativa];
      if (espera === undefined) break;
      await new Promise((r) => setTimeout(r, espera));
    } finally {
      clearTimeout(timer);
    }
  }

  const alvo = new URL(url).host;
  if (ehAbort(ultimo)) {
    throw new TailscaleError(
      `Sem resposta de ${alvo} em ${TIMEOUT_MS / 1000}s (${TENTATIVAS} tentativas).`,
    );
  }
  throw new TailscaleError(
    `Não foi possível falar com ${alvo} em ${TENTATIVAS} tentativas: ${descreverCausa(ultimo)}`,
  );
}

export async function obterAccessToken(agora: Date = new Date()): Promise<string> {
  if (cache && cache.expiraEm - MARGEM_RENOVACAO_MS > agora.getTime()) {
    return cache.token;
  }

  const e = env();
  const clientId = e.TAILSCALE_OAUTH_CLIENT_ID;
  const clientSecret = e.TAILSCALE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new TailscaleError(
      "TAILSCALE_OAUTH_CLIENT_ID e TAILSCALE_OAUTH_CLIENT_SECRET não estão definidos.",
    );
  }

  const resposta = await fetchComTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!resposta.ok) {
    throw new TailscaleError(
      `Falha ao obter access token do Tailscale (HTTP ${resposta.status}).`,
      resposta.status,
    );
  }

  const parsed = tokenSchema.safeParse(await resposta.json());
  if (!parsed.success) {
    throw new TailscaleError("Resposta de token do Tailscale em formato inesperado.");
  }

  const expiresIn = parsed.data.expires_in ?? 3600;
  cache = { token: parsed.data.access_token, expiraEm: agora.getTime() + expiresIn * 1000 };
  return cache.token;
}

/**
 * Lista os devices da tailnet. Devices com shape inesperado são descartados
 * individualmente — um device estranho não pode cegar o monitoramento inteiro.
 */
export async function listarDevices(): Promise<{
  devices: TailscaleDevice[];
  descartados: number;
}> {
  const e = env();
  const tailnet = encodeURIComponent(e.TAILSCALE_TAILNET || "-");
  const token = await obterAccessToken();

  const resposta = await fetchComTimeout(`${API_BASE}/tailnet/${tailnet}/devices`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (resposta.status === 401) {
    // Token pode ter sido revogado antes de expirar: força renovação no ciclo seguinte.
    limparTokenCache();
    throw new TailscaleError("Tailscale recusou o token (401).", 401);
  }

  if (!resposta.ok) {
    throw new TailscaleError(`Tailscale respondeu HTTP ${resposta.status}.`, resposta.status);
  }

  const bruto = devicesSchema.safeParse(await resposta.json());
  if (!bruto.success) {
    throw new TailscaleError("Resposta de devices em formato inesperado.");
  }

  const devices: TailscaleDevice[] = [];
  let descartados = 0;

  for (const item of bruto.data.devices) {
    const parsed = deviceSchema.safeParse(item);
    if (parsed.success) devices.push(parsed.data);
    else descartados += 1;
  }

  return { devices, descartados };
}

/** `lastSeen` vem como string ISO; ausência ou lixo vira null, nunca exceção. */
export function lerLastSeen(valor: string | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "srv-fiscal-01.tail1234.ts.net" → hostname curto para exibição e casamento. */
export function hostnameDoDevice(device: TailscaleDevice): string {
  const bruto = device.hostname ?? device.name ?? device.id;
  return bruto.split(".")[0] ?? bruto;
}
