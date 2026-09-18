import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/config/env";
import { getSettings } from "@/lib/config/settings";
import { extrairPayload } from "@/lib/duplicati/body";
import { parseRelatorioDuplicati } from "@/lib/duplicati/payload";
import { registrarRelatorio } from "@/lib/duplicati/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 5 MB: relatório com muitas mensagens é grande, mas não é ilimitado. */
const LIMITE_CORPO = 5 * 1024 * 1024;

function ipDoRequest(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "desconhecido"
  );
}

/**
 * Webhook de ingestão do Duplicati.
 *
 *   --send-http-url=http://host:3000/api/ingest/duplicati/<token>
 *   --send-http-result-output-format=Json
 *   --send-http-level=All
 *
 * Contratos desta rota:
 *  - autentica por token opaco na URL (um ou mais por cliente, revogáveis);
 *  - aceita JSON, form-urlencoded e texto;
 *  - SEMPRE grava o payload bruto antes de tentar interpretar qualquer coisa;
 *  - responde 2xx rápido. Alertas são avaliados pelo worker, não aqui.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = ipDoRequest(req);
  const e = env();

  const limite = await consumeRateLimit({
    bucket: "ingest",
    identifier: `${token.slice(0, 16)}|${ip}`,
    limit: e.INGEST_RATE_LIMIT_PER_MINUTE,
    windowMinutes: 1,
  });

  if (!limite.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } },
    );
  }

  const registro = await prisma.ingestToken.findUnique({
    where: { token },
    select: { id: true, clientId: true, active: true, revokedAt: true },
  });

  // Resposta genérica: não revela se o token existe, se foi revogado ou de quem é.
  if (!registro || !registro.active || registro.revokedAt !== null) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type");
  let corpo: string;
  try {
    corpo = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "corpo_ilegivel" }, { status: 400 });
  }

  if (corpo.length > LIMITE_CORPO) {
    return NextResponse.json({ ok: false, error: "payload_muito_grande" }, { status: 413 });
  }

  const extraido = extrairPayload(corpo, contentType);

  // Regra 2 do CLAUDE.md: o bruto é salvo mesmo quando não deu para interpretar.
  // Um payload que não entendemos hoje é o que nos permite corrigir o parser amanhã.
  const rawPayload: Prisma.InputJsonValue =
    extraido.payload !== null && typeof extraido.payload === "object"
      ? (extraido.payload as Prisma.InputJsonValue)
      : { _naoInterpretado: corpo.slice(0, 100_000), _formato: extraido.formato };

  const relatorio = parseRelatorioDuplicati(extraido.payload);
  const avisos = [...(extraido.erro ? [extraido.erro] : []), ...relatorio.avisos];
  const parseError = avisos.length > 0 ? avisos.join(" | ") : null;

  try {
    const settings = await getSettings();
    const resultado = await registrarRelatorio({
      clientId: registro.clientId,
      relatorio,
      rawPayload,
      rawContentType: contentType,
      parseError,
      settings,
    });

    // Contabilidade do token fora do caminho crítico da resposta.
    void prisma.ingestToken
      .update({
        where: { id: registro.id },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      })
      .catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        jobId: resultado.backupJobId,
        runId: resultado.backupRunId,
        duplicado: resultado.duplicado,
        maquinaCriada: resultado.maquinaCriada,
        parseError,
      },
      { status: 202 },
    );
  } catch (erro) {
    console.error("[ingest] falha ao registrar relatório", erro);
    return NextResponse.json({ ok: false, error: "falha_interna" }, { status: 500 });
  }
}

/** GET serve só para o operador conferir se a URL está acessível da máquina. */
export async function GET() {
  return NextResponse.json(
    { ok: true, hint: "Endpoint de ingestão ativo. Envie o relatório via POST." },
    { status: 200 },
  );
}
