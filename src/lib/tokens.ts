import { randomBytes } from "node:crypto";

/**
 * Token opaco de ingestão. 32 bytes em base64url ≈ 256 bits de entropia —
 * não é adivinhável e cabe confortavelmente numa URL de --send-http-url.
 * Prefixo facilita identificar a origem em log de proxy.
 */
export function gerarTokenIngestao(): string {
  return `ingest_${randomBytes(32).toString("base64url")}`;
}

/**
 * Monta o snippet pronto para colar nas opções do job do Duplicati.
 * É o que a tela de Clientes exibe para copiar.
 */
export function opcoesDuplicati(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return [
    `--send-http-url=${base}/api/ingest/duplicati/${token}`,
    "--send-http-result-output-format=Json",
    "--send-http-level=All",
  ].join("\n");
}
