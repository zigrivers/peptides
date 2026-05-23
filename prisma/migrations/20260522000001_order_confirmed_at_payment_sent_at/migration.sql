-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmedAt" TIMESTAMP(3),
                    ADD COLUMN "paymentSentAt" TIMESTAMP(3);
