-- receivedAt was added in 20260521000000_init; guard ensures it exists in all environments
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_userId_vendorId_confirmedAt_idx" ON "Order"("userId", "vendorId", "confirmedAt");
