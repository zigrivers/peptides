-- Add requestedByUserId to AccountDeletionRequest so the cron can verify the
-- original power user who initiated the deletion (audit traceability).
-- Nullable to support legacy rows and self-deletion flows (where the user
-- requests their own deletion via Settings → no power user actor).
ALTER TABLE "AccountDeletionRequest" ADD COLUMN "requestedByUserId" TEXT;
CREATE INDEX "AccountDeletionRequest_requestedByUserId_idx" ON "AccountDeletionRequest"("requestedByUserId");
