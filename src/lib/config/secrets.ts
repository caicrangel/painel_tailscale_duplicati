import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifragem de segredos guardados no banco (token do bot, senha de SMTP).
 *
 * O CLAUDE.md diz "segredo só por env" — e continua valendo para o segredo da
 * aplicação (AUTH_SECRET, credenciais do Tailscale). Mas configurar Telegram e
 * SMTP pela interface exige guardar esses valores em algum lugar, e a escolha
 * responsável é: cifrado em repouso, com a chave vindo da env, e nunca devolvido
 * ao navegador — a UI só sabe se está configurado ou não.
 *
 * AES-256-GCM: além de cifrar, autentica. Payload adulterado no banco falha a
 * decifragem em vez de devolver lixo.
 */

const ALGORITMO = "aes-256-gcm";

export type SegredoCifrado = { iv: string; tag: string; dados: string };

function chave(): Buffer {
  const material = process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!material) {
    throw new Error(
      "Defina SETTINGS_ENCRYPTION_KEY (ou AUTH_SECRET) para guardar segredos nas configurações.",
    );
  }
  // Deriva 32 bytes de qualquer tamanho de entrada.
  return createHash("sha256").update(material).digest();
}

export function cifrar(texto: string): SegredoCifrado {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, chave(), iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    dados: dados.toString("base64"),
  };
}

/** Devolve null quando o valor não decifra (chave trocada, dado corrompido). */
export function decifrar(segredo: SegredoCifrado): string | null {
  try {
    const decipher = createDecipheriv(ALGORITMO, chave(), Buffer.from(segredo.iv, "base64"));
    decipher.setAuthTag(Buffer.from(segredo.tag, "base64"));
    const texto = Buffer.concat([
      decipher.update(Buffer.from(segredo.dados, "base64")),
      decipher.final(),
    ]);
    return texto.toString("utf8");
  } catch {
    return null;
  }
}

export function ehSegredoCifrado(valor: unknown): valor is SegredoCifrado {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as SegredoCifrado).iv === "string" &&
    typeof (valor as SegredoCifrado).tag === "string" &&
    typeof (valor as SegredoCifrado).dados === "string"
  );
}

/** Máscara para exibir na UI sem revelar o segredo: "••••••1234". */
export function mascarar(valor: string | null): string | null {
  if (!valor) return null;
  const fim = valor.slice(-4);
  return `${"•".repeat(Math.min(12, Math.max(4, valor.length - 4)))}${fim}`;
}
