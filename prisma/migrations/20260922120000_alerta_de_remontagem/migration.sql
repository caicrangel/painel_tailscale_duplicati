-- AlterEnum
-- Remontagem bem-sucedida vira incidente próprio: o share caiu, mesmo que o
-- script tenha consertado. É o aviso que antecede o MOUNT_FAILED.
ALTER TYPE "AlertType" ADD VALUE 'MOUNT_REMOUNTED';
