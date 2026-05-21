-- AlterTable: add oldEmail column to EmailChangeRequest
-- Captured at request time so revert can restore the previous address.
ALTER TABLE "EmailChangeRequest" ADD COLUMN "oldEmail" TEXT NOT NULL DEFAULT '';

-- Remove the default now that it's set — new rows always supply oldEmail explicitly.
ALTER TABLE "EmailChangeRequest" ALTER COLUMN "oldEmail" DROP DEFAULT;
