-- CreateTable
CREATE TABLE "run_notifications" (
    "id" TEXT NOT NULL,
    "backupRunId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_notifications_status_createdAt_idx" ON "run_notifications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "run_notifications_backupRunId_channel_key" ON "run_notifications"("backupRunId", "channel");

-- AddForeignKey
ALTER TABLE "run_notifications" ADD CONSTRAINT "run_notifications_backupRunId_fkey" FOREIGN KEY ("backupRunId") REFERENCES "backup_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

