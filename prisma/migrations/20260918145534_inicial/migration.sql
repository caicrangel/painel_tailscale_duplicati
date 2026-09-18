-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('ESSENCIAL', 'PROFISSIONAL', 'CORPORATIVO');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ONLINE', 'IDLE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MachineSource" AS ENUM ('TAILSCALE', 'DUPLICATI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ParsedResult" AS ENUM ('SUCCESS', 'WARNING', 'ERROR', 'FATAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OK', 'WARNING', 'ERROR', 'LATE', 'PAUSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BACKUP_FAILED', 'BACKUP_WARNING', 'BACKUP_LATE', 'MACHINE_OFFLINE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('OPEN', 'RECOVERY');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('TAILSCALE', 'LATE_CHECK', 'ALERTS', 'NOTIFY', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'ESSENCIAL',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "telegramChatId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'padrão',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "source" "MachineSource" NOT NULL DEFAULT 'TAILSCALE',
    "tailscaleDeviceId" TEXT,
    "duplicatiMachineId" TEXT,
    "hostname" TEXT NOT NULL,
    "displayName" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "tailscaleVersion" TEXT,
    "addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updateAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "status" "MachineStatus" NOT NULL DEFAULT 'UNKNOWN',
    "statusChangedAt" TIMESTAMP(3),
    "maintenanceUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_jobs" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duplicatiBackupId" TEXT NOT NULL,
    "destinationHint" TEXT,
    "expectedIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "toleranceMinutes" INTEGER NOT NULL DEFAULT 360,
    "graceUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastParsedResult" "ParsedResult",
    "lastRunId" TEXT,
    "nextExpectedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "backupJobId" TEXT NOT NULL,
    "parsedResult" "ParsedResult" NOT NULL DEFAULT 'UNKNOWN',
    "beginTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "sizeOfExaminedFiles" BIGINT,
    "examinedFiles" BIGINT,
    "addedFiles" BIGINT,
    "deletedFiles" BIGINT,
    "modifiedFiles" BIGINT,
    "bytesUploaded" BIGINT,
    "bytesDownloaded" BIGINT,
    "knownFileSize" BIGINT,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "mainOperation" TEXT,
    "duplicatiVersion" TEXT,
    "rawPayload" JSONB NOT NULL,
    "rawContentType" TEXT,
    "parseError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clientId" TEXT,
    "machineId" TEXT,
    "backupJobId" TEXT,
    "backupRunId" TEXT,
    "relatedJobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context" JSONB,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_notifications" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "kind" "NotificationKind" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "itemsProcessed" INTEGER,
    "error" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_active_idx" ON "users"("active");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE INDEX "clients_active_idx" ON "clients"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_tokens_token_key" ON "ingest_tokens"("token");

-- CreateIndex
CREATE INDEX "ingest_tokens_clientId_active_idx" ON "ingest_tokens"("clientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "machines_tailscaleDeviceId_key" ON "machines"("tailscaleDeviceId");

-- CreateIndex
CREATE INDEX "machines_clientId_status_idx" ON "machines"("clientId", "status");

-- CreateIndex
CREATE INDEX "machines_status_lastSeen_idx" ON "machines"("status", "lastSeen");

-- CreateIndex
CREATE INDEX "machines_duplicatiMachineId_idx" ON "machines"("duplicatiMachineId");

-- CreateIndex
CREATE INDEX "backup_jobs_status_nextExpectedAt_idx" ON "backup_jobs"("status", "nextExpectedAt");

-- CreateIndex
CREATE INDEX "backup_jobs_active_paused_idx" ON "backup_jobs"("active", "paused");

-- CreateIndex
CREATE UNIQUE INDEX "backup_jobs_machineId_duplicatiBackupId_key" ON "backup_jobs"("machineId", "duplicatiBackupId");

-- CreateIndex
CREATE INDEX "backup_runs_backupJobId_receivedAt_idx" ON "backup_runs"("backupJobId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "backup_runs_receivedAt_idx" ON "backup_runs"("receivedAt" DESC);

-- CreateIndex
CREATE INDEX "backup_runs_parsedResult_receivedAt_idx" ON "backup_runs"("parsedResult", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "backup_runs_backupJobId_beginTime_endTime_key" ON "backup_runs"("backupJobId", "beginTime", "endTime");

-- CreateIndex
CREATE INDEX "alerts_closedAt_severity_openedAt_idx" ON "alerts"("closedAt", "severity", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "alerts_dedupeKey_idx" ON "alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "alerts_openedAt_idx" ON "alerts"("openedAt" DESC);

-- CreateIndex
CREATE INDEX "alert_notifications_status_createdAt_idx" ON "alert_notifications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_notifications_alertId_kind_key" ON "alert_notifications"("alertId", "kind");

-- CreateIndex
CREATE INDEX "sync_logs_kind_startedAt_idx" ON "sync_logs"("kind", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "rate_limit_hits_windowStart_idx" ON "rate_limit_hits"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_hits_bucket_identifier_windowStart_key" ON "rate_limit_hits"("bucket", "identifier", "windowStart");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_tokens" ADD CONSTRAINT "ingest_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_backupJobId_fkey" FOREIGN KEY ("backupJobId") REFERENCES "backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_backupJobId_fkey" FOREIGN KEY ("backupJobId") REFERENCES "backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_backupRunId_fkey" FOREIGN KEY ("backupRunId") REFERENCES "backup_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_notifications" ADD CONSTRAINT "alert_notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
