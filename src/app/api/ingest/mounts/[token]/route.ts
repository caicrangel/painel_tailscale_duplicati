import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/config/env";
import { extrairPayload } from "@/lib/duplicati/body";
import { parseRelatorioMontagens } from "@/lib/mounts/payload";
import { registrarVerificacaoMontagens } from "@/lib/mounts/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMITE_CORPO = 512 * 1024;

/**
 * Verificação de montagens enviada pelo script que roda na máquina do cliente.
 *
 *   curl -X POST --data @relatorio.json \
 *     http://painel:3000/api/ingest/mounts/<token-do-cliente>
 *
 * Mesmo contrato da ingestão do Duplicati: token opaco na URL, payload bruto
 * gravado sempre, parsing defensivo e resposta rápida.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "desconhecido";

  const limite = await consumeRateLimit({
    bucket: "ingest",
    identifier: `${token.slice(0, 16)}|${ip}`,
    limit: env().INGEST_RATE_LIMIT_PER_MINUTE,
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
  const rawPayload: Prisma.InputJsonValue =
    extraido.payload !== null && typeof extraido.payload === "object"
      ? (extraido.payload as Prisma.InputJsonValue)
      : { _naoInterpretado: corpo.slice(0, 50_000), _formato: extraido.formato };

  const relatorio = parseRelatorioMontagens(extraido.payload);
  const avisos = [...(extraido.erro ? [extraido.erro] : []), ...relatorio.avisos];
  const parseError = avisos.length > 0 ? avisos.join(" | ") : null;

  try {
    const resultado = await registrarVerificacaoMontagens({
      clientId: registro.clientId,
      relatorio,
      rawPayload,
      parseError,
    });

    void prisma.ingestToken
      .update({
        where: { id: registro.id },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      })
      .catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        mountCheckId: resultado.mountCheckId,
        resultado: relatorio.result,
        pontos: relatorio.pointsTotal,
        falhas: relatorio.pointsFailed,
        maquinaCriada: resultado.maquinaCriada,
        parseError,
      },
      { status: 202 },
    );
  } catch (erro) {
    console.error("[ingest:mounts] falha ao registrar verificação", erro);
    return NextResponse.json({ ok: false, error: "falha_interna" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, hint: "Endpoint de verificação de montagens ativo. Envie o relatório via POST." },
    { status: 200 },
  );
}
