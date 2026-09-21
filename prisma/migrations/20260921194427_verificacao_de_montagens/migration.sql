-- CreateEnum
CREATE TYPE "MountCheckResult" AS ENUM ('OK', 'RECOVERED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MountPointStatus" AS ENUM ('OK', 'REMOUNTED', 'FAILED', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'MOUNT_FAILED';
ALTER TYPE "AlertType" ADD VALUE 'MOUNT_LATE';

-- AlterTable
ALTER TABLE "machines" ADD COLUMN     "lastMountCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastMountCheckResult" "MountCheckResult",
ADD COLUMN     "mountCheckIntervalMinutes" INTEGER,
ADD COLUMN     "mountCheckToleranceMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "mount_checks" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "result" "MountCheckResult" NOT NULL DEFAULT 'UNKNOWN',
    "pointsTotal" INTEGER NOT NULL DEFAULT 0,
    "pointsFailed" INTEGER NOT NULL DEFAULT 0,
    "remounted" BOOLEAN NOT NULL DEFAULT false,
    "durationSeconds" INTEGER,
    "bootAt" TIMESTAMP(3),
    "bootRecent" BOOLEAN NOT NULL DEFAULT false,
    "reportedHost" TEXT,
    "startedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "parseError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mount_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mount_check_points" (
    "id" TEXT NOT NULL,
    "mountCheckId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "MountPointStatus" NOT NULL DEFAULT 'UNKNOWN',
    "fsTypeExpected" TEXT,
    "fsTypeActual" TEXT,
    "detail" TEXT,
    "size" TEXT,
    "used" TEXT,
    "available" TEXT,
    "usePercent" TEXT,

    CONSTRAINT "mount_check_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mount_checks_machineId_receivedAt_idx" ON "mount_checks"("machineId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "mount_checks_result_receivedAt_idx" ON "mount_checks"("result", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "mount_check_points_mountCheckId_idx" ON "mount_check_points"("mountCheckId");

-- AddForeignKey
ALTER TABLE "mount_checks" ADD CONSTRAINT "mount_checks_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mount_check_points" ADD CONSTRAINT "mount_check_points_mountCheckId_fkey" FOREIGN KEY ("mountCheckId") REFERENCES "mount_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

