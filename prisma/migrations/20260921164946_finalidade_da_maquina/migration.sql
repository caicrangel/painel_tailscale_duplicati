-- CreateEnum
CREATE TYPE "MachineRole" AS ENUM ('CLIENTE', 'SUPORTE');

-- AlterTable
ALTER TABLE "machines" ADD COLUMN     "role" "MachineRole" NOT NULL DEFAULT 'CLIENTE';

-- CreateIndex
CREATE INDEX "machines_role_status_idx" ON "machines"("role", "status");

