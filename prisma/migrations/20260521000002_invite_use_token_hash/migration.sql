-- AlterTable: migrate Invite.token -> tokenHash (SHA-256 hashed storage)
-- Add new tokenHash column with temporary default so existing rows (if any) get a value
ALTER TABLE "Invite" ADD COLUMN "tokenHash" TEXT NOT NULL DEFAULT '';
-- Add new optional fields from the domain model
ALTER TABLE "Invite" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Invite" ADD COLUMN "acceptedByUserId" TEXT;

-- Migrate existing token values: use them as their own hash (no real data exists yet)
UPDATE "Invite" SET "tokenHash" = "token" WHERE "tokenHash" = '';

-- Remove the default; all new rows must supply tokenHash explicitly
ALTER TABLE "Invite" ALTER COLUMN "tokenHash" DROP DEFAULT;

-- Add unique constraint on tokenHash and index on powerUserId+status
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_tokenHash_key" UNIQUE ("tokenHash");
CREATE INDEX "Invite_powerUserId_status_idx" ON "Invite"("powerUserId", "status");

-- Drop the old token column (no longer used)
ALTER TABLE "Invite" DROP COLUMN "token";
