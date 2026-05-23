-- Add lastDispatchedAt to ReminderPreference for cron-loop dedupe.
-- Each 15-minute tick can re-evaluate the same in-window user, and we
-- must dispatch at most once per local calendar day per user. Nullable
-- so the column requires no backfill.
ALTER TABLE "ReminderPreference"
  ADD COLUMN "lastDispatchedAt" TIMESTAMP(3);
