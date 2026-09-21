import { z } from "zod";

/** Regra 1 do CLAUDE.md: todo input externo passa por Zod. */

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/**
 * Campo opcional lido de FormData.
 *
 * `nullish` e não `optional`: um input desabilitado ou ausente não é enviado, e
 * `formData.get()` devolve null — que `z.string().optional()` rejeita. Sem isto,
 * desabilitar um campo na tela quebra o salvamento inteiro com um erro de
 * validação que não fala do campo desabilitado.
 */
const textoOpcional = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v === "" || v === null ? undefined : v));

export const clientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120),
  plan: z.enum(["ESSENCIAL", "PROFISSIONAL", "CORPORATIVO"]),
  contactName: textoOpcional,
  contactEmail: z
    .string()
    .trim()
    .email("E-mail de contato inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  contactPhone: textoOpcional,
  telegramChatId: textoOpcional,
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  active: z.coerce.boolean().default(true),
});

export type ClientInput = z.infer<typeof clientSchema>;

export const machineSchema = z.object({
  role: z.enum(["CLIENTE", "SUPORTE"]).default("CLIENTE"),
  clientId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === "" || v === "null" || v === null ? undefined : v)),
  hostname: z.string().trim().min(1, "Informe o hostname.").max(200),
  displayName: textoOpcional,
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  maintenanceUntil: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !Number.isNaN(d.getTime()), "Data de manutenção inválida."),
});

export const atribuirMaquinaSchema = z.object({
  machineId: z.string().min(1),
  clientId: z
    .string()
    .trim()
    .transform((v) => (v === "" || v === "null" ? null : v)),
});

export const backupJobSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do job.").max(200),
  expectedIntervalMinutes: z.coerce
    .number()
    .int("Use um número inteiro de minutos.")
    .min(5, "O intervalo mínimo é de 5 minutos.")
    .max(60 * 24 * 90, "O intervalo máximo é de 90 dias."),
  toleranceMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30, "A tolerância máxima é de 30 dias."),
  destinationHint: textoOpcional,
  active: z.coerce.boolean().default(true),
  paused: z.coerce.boolean().default(false),
});

export const userSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
  active: z.coerce.boolean().default(true),
});

export const novaSenhaSchema = z.object({
  password: z.string().min(12, "A senha precisa ter ao menos 12 caracteres."),
});

/** Primeiro erro legível de um ZodError, para devolver na ActionResult. */
export function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
