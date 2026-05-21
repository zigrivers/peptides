-- AlterTable: migrate Invite.token -> tokenHash (SHA-256 hashed storage)
-- Any existing PENDING invites are REVOKED rather than migrating their raw tokens.
-- Copying raw tokens would defeat hashed-storage — fresh invites always store SHA-256(rawToken).

-- Add new columns (tokenHash, acceptedAt, acceptedByUserId)
ALTER TABLE "Invite" ADD COLUMN "tokenHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invite" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Invite" ADD COLUMN "acceptedByUserId" TEXT;

-- Revoke any existing PENDING invites rather than preserving plaintext tokens
UPDATE "Invite" SET "status" = 'REVOKED' WHERE "status" = 'PENDING';

-- Assign unique placeholder tokenHash values to all rows (raw token values are NOT copied)
UPDATE "Invite" SET "tokenHash" = 'revoked-pre-migration-' || "id" WHERE "tokenHash" = '';

-- Remove the temporary default; all new rows must supply tokenHash explicitly
ALTER TABLE "Invite" ALTER COLUMN "tokenHash" DROP DEFAULT;

-- Add unique constraint on tokenHash and index on powerUserId+status
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_tokenHash_key" UNIQUE ("tokenHash");
CREATE INDEX "Invite_powerUserId_status_idx" ON "Invite"("powerUserId", "status");

-- Drop the old plaintext token column
ALTER TABLE "Invite" DROP COLUMN "token";
