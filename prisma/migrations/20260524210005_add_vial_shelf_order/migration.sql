-- AlterTable
ALTER TABLE "Vial" ADD COLUMN     "shelfOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Vial_userId_status_shelfOrder_expiresAt_idx" ON "Vial"("userId", "status", "shelfOrder", "expiresAt");
