/**
 * Cria ou redefine a senha de um administrador.
 *
 * Diferente do seed (que é idempotente e não mexe em usuário existente), este
 * script SOBRESCREVE a senha — é a saída quando o admin já existe mas a senha
 * ficou errada, ou quando alguém perdeu o acesso.
 *
 *   Docker: docker compose run --rm worker npx tsx scripts/definir-senha-admin.mts <email> '<senha>'
 *   Local:  npx tsx scripts/definir-senha-admin.mts <email> '<senha>'
 *
 * Use aspas SIMPLES na senha: caracteres como & e $ são interpretados pelo shell.
 */
import { prisma } from "@/lib/db/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";

const [emailBruto, senha] = process.argv.slice(2);

if (!emailBruto || !senha) {
  console.error(
    "uso: npx tsx scripts/definir-senha-admin.mts <email> '<senha>'\n" +
      "     (aspas simples na senha, por causa de & e $ no shell)",
  );
  process.exit(1);
}

const email = emailBruto.trim().toLowerCase();

const forca = validatePasswordStrength(senha);
if (!forca.ok) {
  console.error(`senha recusada: ${forca.error}`);
  process.exit(1);
}

const passwordHash = await hashPassword(senha);

const existente = await prisma.user.findUnique({ where: { email } });

const user = await prisma.user.upsert({
  where: { email },
  update: { passwordHash, active: true, role: "ADMIN" },
  create: { email, passwordHash, name: "Administrador", role: "ADMIN", active: true },
});

await prisma.auditLog.create({
  data: {
    userId: user.id,
    userEmail: email,
    action: existente ? "usuario.senha_redefinida_por_script" : "usuario.criado_por_script",
    entityType: "User",
    entityId: user.id,
  },
});

console.log(
  existente
    ? `senha redefinida para ${email} (papel ADMIN, ativo)`
    : `admin criado: ${email}`,
);
console.log(`caracteres na senha informada: ${senha.length}`);

await prisma.$disconnect();
