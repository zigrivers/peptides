/*
  Warnings:

  - You are about to drop the column `profileId` on the `Citation` table. All the data in the column will be lost.
  - You are about to drop the column `compoundId` on the `CompoundProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[catalogKey]` on the table `Compound` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[catalogItemId]` on the table `CompoundProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `catalogItemId` to the `Citation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalogKey` to the `Compound` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalogItemId` to the `CompoundProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CatalogItemKind" AS ENUM ('PEPTIDE', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PUBLISHED', 'PENDING_REVIEW');

-- DropForeignKey
ALTER TABLE "Citation" DROP CONSTRAINT "Citation_profileId_fkey";

-- DropForeignKey
ALTER TABLE "CompoundProfile" DROP CONSTRAINT "CompoundProfile_compoundId_fkey";

-- DropIndex
DROP INDEX "CompoundProfile_compoundId_key";

-- AlterTable (Step 1: Add new columns as nullable)
ALTER TABLE "Compound" ADD COLUMN     "catalogKey" TEXT,
ADD COLUMN     "kind" "CatalogItemKind" NOT NULL DEFAULT 'PEPTIDE',
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "revisionStatus" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "sourceVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CompoundProfile" ADD COLUMN     "catalogItemId" TEXT;

ALTER TABLE "Citation" ADD COLUMN     "catalogItemId" TEXT;

-- Step 2: Backfill data from existing columns and relations
UPDATE "Compound" SET "catalogKey" = "slug";

UPDATE "CompoundProfile" SET "catalogItemId" = "compoundId";

UPDATE "Citation" SET "catalogItemId" = (SELECT "compoundId" FROM "CompoundProfile" WHERE "id" = "profileId");

-- Step 3: Enforce NOT NULL constraints and drop old columns
ALTER TABLE "Compound" ALTER COLUMN "catalogKey" SET NOT NULL;

ALTER TABLE "CompoundProfile" ALTER COLUMN "catalogItemId" SET NOT NULL;
ALTER TABLE "CompoundProfile" DROP COLUMN "compoundId";

ALTER TABLE "Citation" ALTER COLUMN "catalogItemId" SET NOT NULL;
ALTER TABLE "Citation" DROP COLUMN "profileId";

-- CreateTable
CREATE TABLE "SupplementProfile" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "servingSize" DECIMAL(10,3) NOT NULL,
    "servingUnit" TEXT NOT NULL,
    "dosingLow" JSONB NOT NULL,
    "dosingTypical" JSONB NOT NULL,
    "dosingHigh" JSONB NOT NULL,
    "benefitTimeline" JSONB,
    "dosingFrequency" "DosingFrequency",
    "dosesPerDay" INTEGER,
    "preferredTime" "PreferredTime",
    "timingNotes" TEXT,

    CONSTRAINT "SupplementProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItemRevision" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "CatalogItemKind" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplementProfile_catalogItemId_key" ON "SupplementProfile"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Compound_catalogKey_key" ON "Compound"("catalogKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompoundProfile_catalogItemId_key" ON "CompoundProfile"("catalogItemId");

-- AddForeignKey
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "CompoundProfile_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplementProfile" ADD CONSTRAINT "SupplementProfile_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemRevision" ADD CONSTRAINT "CatalogItemRevision_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
