import { hash, verify } from "@node-rs/argon2";

/** Parâmetros argon2id recomendados pelo OWASP (m=19 MiB, t=2, p=1). */
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain);
  } catch {
    // Hash malformado no banco não deve vazar exceção para a tela de login.
    return false;
  }
}

/** Política mínima de senha para usuários criados pela UI e pelo seed. */
export function validatePasswordStrength(plain: string): { ok: true } | { ok: false; error: string } {
  if (plain.length < 12) return { ok: false, error: "A senha precisa ter ao menos 12 caracteres." };
  if (!/[a-zA-Z]/.test(plain)) return { ok: false, error: "A senha precisa ter ao menos uma letra." };
  if (!/[0-9\W]/.test(plain)) {
    return { ok: false, error: "A senha precisa ter ao menos um número ou símbolo." };
  }
  return { ok: true };
}
