"use client";

import type { IngestToken } from "@prisma/client";
import { ActionButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { rotacionarToken, revogarToken } from "@/server/clients-actions";
import { fmtDataHora, fmtNumero } from "@/lib/utils/format";

export function TokensPanel({
  clientId,
  tokens,
  baseUrl,
  podeAdministrar,
}: {
  clientId: string;
  tokens: IngestToken[];
  baseUrl: string;
  podeAdministrar: boolean;
}) {
  const ativos = tokens.filter((t) => t.active && !t.revokedAt);
  const principal = ativos[0];

  const snippet = principal
    ? [
        `--send-http-url=${baseUrl.replace(/\/+$/, "")}/api/ingest/duplicati/${principal.token}`,
        "--send-http-result-output-format=Json",
        "--send-http-level=All",
      ].join("\n")
    : null;

  return (
    <div className="space-y-5">
      {snippet && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)]">
              Opções do Duplicati — cole nas &quot;Advanced options&quot; do job
            </p>
            <CopyButton value={snippet} label="Copiar opções" />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--color-fg)]">
            {snippet}
          </pre>
          <p className="mt-2 text-xs text-[var(--color-faint)]">
            Este endereço precisa ser alcançável pela máquina do cliente dentro da tailnet.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {tokens.map((t) => {
          const revogado = !t.active || t.revokedAt !== null;
          return (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <Badge tone={revogado ? "neutral" : "ok"} dot>
                {revogado ? "revogado" : "ativo"}
              </Badge>
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-muted)]">
                {t.token}
              </code>
              <span className="text-xs text-[var(--color-faint)]">
                {t.useCount > 0
                  ? `${fmtNumero(t.useCount)} uso(s) · último ${fmtDataHora(t.lastUsedAt)}`
                  : "nunca usado"}
              </span>
              {!revogado && <CopyButton value={t.token} label="Copiar token" />}
              {podeAdministrar && !revogado && (
                <ActionButton
                  action={() => revogarToken(t.id)}
                  label="Revogar"
                  variant="ghost"
                  size="sm"
                  confirmar="Revogar este token? As máquinas que ainda o usam param de reportar."
                />
              )}
            </div>
          );
        })}
      </div>

      {podeAdministrar && (
        <ActionButton
          action={() => rotacionarToken(clientId)}
          label="Gerar novo token"
          variant="secondary"
          size="sm"
        />
      )}
      {podeAdministrar && (
        <p className="text-xs text-[var(--color-faint)]">
          O token antigo continua valendo até ser revogado — reconfigure as máquinas antes de
          revogar, para não perder relatórios no intervalo.
        </p>
      )}
    </div>
  );
}
