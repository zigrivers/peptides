-- Multi-dose-per-day support: add a per-day dose occurrence slot and key uniqueness on it.
-- Additive + idempotent. Existing logs default to slot 0 (preserves once-daily uniqueness).

ALTER TABLE "DoseLog" ADD COLUMN IF NOT EXISTS "doseSlot" INTEGER NOT NULL DEFAULT 0;

-- Swap the per-day unique constraint to include the slot.
DROP INDEX IF EXISTS "DoseLog_userId_protocolId_scheduledDate_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DoseLog_userId_protocolId_scheduledDate_doseSlot_key"
  ON "DoseLog" ("userId", "protocolId", "scheduledDate", "doseSlot");
