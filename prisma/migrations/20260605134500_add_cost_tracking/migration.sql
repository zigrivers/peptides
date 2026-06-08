-- AlterTable
ALTER TABLE "DoseLog" ADD COLUMN     "loggedCost" DECIMAL(10,2),
ADD COLUMN     "loggedCurrency" TEXT;

-- AlterTable
ALTER TABLE "Vial" ADD COLUMN     "cost" DECIMAL(10,2),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';
