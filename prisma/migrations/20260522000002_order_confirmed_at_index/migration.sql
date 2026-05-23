-- CreateIndex
CREATE INDEX "Order_userId_vendorId_confirmedAt_idx" ON "Order"("userId", "vendorId", "confirmedAt");
