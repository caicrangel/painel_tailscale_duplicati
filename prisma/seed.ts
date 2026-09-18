import { PrismaClient, Role } from "@prisma/client";
import { hashPassword, validatePasswordStrength } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env antes de rodar o seed.",
    );
  }

  const força = validatePasswordStrength(password);
  if (!força.ok) throw new Error(`SEED_ADMIN_PASSWORD fraca: ${força.error}`);

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    console.log(`[seed] admin ${email} já existe (id ${existente.id}), nada a fazer.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, userEmail: email, action: "seed.admin_criado", entityType: "User", entityId: user.id },
  });

  console.log(`[seed] admin criado: ${email}`);
  console.log("[seed] troque a senha no primeiro login e remova SEED_ADMIN_PASSWORD do .env.");
}

main()
  .catch((e) => {
    console.error("[seed] falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
