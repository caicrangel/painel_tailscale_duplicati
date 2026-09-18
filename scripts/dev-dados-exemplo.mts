/**
 * Popula o banco com dados fictícios para desenvolvimento e demonstração.
 * NÃO use em produção: apaga clientes de exemplo e recria tudo.
 *
 *   npx tsx scripts/dev-dados-exemplo.mts
 */
import { prisma } from "@/lib/db/prisma";
import { gerarTokenIngestao } from "@/lib/tokens";
import { verificarAtrasos } from "../worker/tasks/late-check";
import { avaliarAlertas } from "../worker/tasks/alerts";

const DIA = 86_400_000;
const agora = Date.now();

const CLIENTES = [
  { nome: "Contabilidade Modelo", plano: "PROFISSIONAL" as const },
  { nome: "Transportes Vale Verde", plano: "CORPORATIVO" as const },
  { nome: "Clínica São Lucas", plano: "ESSENCIAL" as const },
];

const MAQUINAS = [
  { cliente: 0, hostname: "srv-fiscal-01", os: "linux", minutosSemContato: 1 },
  { cliente: 0, hostname: "desktop-contabil", os: "windows", minutosSemContato: 22 },
  { cliente: 1, hostname: "srv-erp-prod", os: "linux", minutosSemContato: 2 },
  { cliente: 1, hostname: "srv-arquivos", os: "linux", minutosSemContato: 4 * 24 * 60 },
  { cliente: 2, hostname: "pc-recepcao", os: "windows", minutosSemContato: 3 },
];

const JOBS = [
  { maquina: 0, nome: "Dados Fiscais", intervalo: 1440, tolerancia: 360, perfil: "ok" },
  { maquina: 0, nome: "Banco de Dados", intervalo: 720, tolerancia: 180, perfil: "warning" },
  { maquina: 1, nome: "Documentos", intervalo: 1440, tolerancia: 360, perfil: "ok" },
  { maquina: 2, nome: "ERP completo", intervalo: 1440, tolerancia: 240, perfil: "erro" },
  { maquina: 3, nome: "Arquivos compartilhados", intervalo: 1440, tolerancia: 360, perfil: "atrasado" },
  { maquina: 4, nome: "Prontuários", intervalo: 1440, tolerancia: 720, perfil: "ok" },
];

function statusDe(minutos: number) {
  if (minutos < 5) return "ONLINE" as const;
  if (minutos < 60) return "IDLE" as const;
  return "OFFLINE" as const;
}

// Remover o cliente apenas desvincula as máquinas (onDelete: SetNull), então
// as máquinas de exemplo são apagadas explicitamente pelo prefixo do deviceId.
await prisma.machine.deleteMany({ where: { tailscaleDeviceId: { startsWith: "dev-" } } });
await prisma.client.deleteMany({ where: { name: { in: CLIENTES.map((c) => c.nome) } } });

const clientes = [];
for (const c of CLIENTES) {
  clientes.push(
    await prisma.client.create({
      data: {
        name: c.nome,
        slug: c.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        plan: c.plano,
        contactEmail: `ti@${c.nome.split(" ")[0]!.toLowerCase()}.com.br`,
        ingestTokens: { create: { token: gerarTokenIngestao() } },
      },
    }),
  );
}

const maquinas = [];
for (const m of MAQUINAS) {
  maquinas.push(
    await prisma.machine.create({
      data: {
        clientId: clientes[m.cliente]!.id,
        source: "TAILSCALE",
        tailscaleDeviceId: `dev-${m.hostname}`,
        hostname: m.hostname,
        displayName: `${m.hostname}.tail1234.ts.net`,
        os: m.os,
        tailscaleVersion: "1.78.1",
        addresses: ["100.64.0.10"],
        tags: m.os === "linux" ? ["tag:servidor"] : ["tag:estacao"],
        lastSeen: new Date(agora - m.minutosSemContato * 60_000),
        status: statusDe(m.minutosSemContato),
        statusChangedAt: new Date(agora - m.minutosSemContato * 60_000),
      },
    }),
  );
}

// Uma máquina descoberta e ainda não vinculada a cliente algum.
await prisma.machine.create({
  data: {
    source: "TAILSCALE",
    tailscaleDeviceId: "dev-novo-notebook",
    hostname: "notebook-novo",
    os: "macOS",
    lastSeen: new Date(agora - 60_000),
    status: "ONLINE",
    updateAvailable: true,
  },
});

for (const j of JOBS) {
  const job = await prisma.backupJob.create({
    data: {
      machineId: maquinas[j.maquina]!.id,
      name: j.nome,
      duplicatiBackupId: `DB-${j.nome.slice(0, 3).toUpperCase()}`,
      expectedIntervalMinutes: j.intervalo,
      toleranceMinutes: j.tolerancia,
      destinationHint: "S3 · sa-east-1",
    },
  });

  const diasDeHistorico = 14;
  const paraDeRodarApos = j.perfil === "atrasado" ? 4 : 0;

  for (let d = diasDeHistorico; d >= paraDeRodarApos; d -= 1) {
    const quando = new Date(agora - d * DIA - 3 * 3600_000);
    const resultado =
      j.perfil === "erro" && d < 2
        ? "ERROR"
        : j.perfil === "warning" && d % 5 === 0
          ? "WARNING"
          : d === 9
            ? "WARNING"
            : "SUCCESS";

    await prisma.backupRun.create({
      data: {
        backupJobId: job.id,
        parsedResult: resultado,
        beginTime: quando,
        endTime: new Date(quando.getTime() + 12 * 60_000),
        durationSeconds: 720 + d * 7,
        sizeOfExaminedFiles: BigInt(187_904_819_200 + d * 1_000_000),
        examinedFiles: BigInt(48_213 - d),
        addedFiles: BigInt(15),
        bytesUploaded: BigInt(2_465_923_072 - d * 10_000_000),
        knownFileSize: BigInt(412_316_860_416),
        warningsCount: resultado === "WARNING" ? 3 : 0,
        errorsCount: resultado === "ERROR" ? 1 : 0,
        messagesCount: 27,
        mainOperation: "Backup",
        duplicatiVersion: "2.0.8.1 (2.0.8.1_beta_2024-05-07)",
        rawPayload: {
          Data: { ParsedResult: resultado, MainOperation: "Backup" },
          Extra: { "backup-name": j.nome },
        },
        rawContentType: "application/json",
        receivedAt: quando,
      },
    });
  }

  const ultima = await prisma.backupRun.findFirst({
    where: { backupJobId: job.id },
    orderBy: { receivedAt: "desc" },
  });

  await prisma.backupJob.update({
    where: { id: job.id },
    data: {
      lastRunAt: ultima?.receivedAt,
      lastParsedResult: ultima?.parsedResult,
      lastRunId: ultima?.id,
      graceUntil: null,
    },
  });
}

console.log("jobs reavaliados:", await verificarAtrasos());
console.log("alertas gerados:", await avaliarAlertas());
console.log("pronto. clientes:", clientes.length, "máquinas:", maquinas.length + 1);
await prisma.$disconnect();
