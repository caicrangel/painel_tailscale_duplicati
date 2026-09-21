-- AlterTable
ALTER TABLE "machines" ADD COLUMN     "duplicatiHostnames" TEXT[] DEFAULT ARRAY[]::TEXT[];
