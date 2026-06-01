-- CreateEnum
CREATE TYPE "DosingFrequency" AS ENUM ('DAILY', 'EOD', 'THRICE_WEEKLY', 'WEEKLY', 'TWICE_WEEKLY', 'EVERY_TWO_WEEKS', 'EVERY_FOUR_WEEKS', 'AS_NEEDED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PreferredTime" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'PRE_WORKOUT', 'POST_WORKOUT', 'MORNING_AND_NIGHT', 'MORNING_AFTERNOON_NIGHT', 'PRE_AND_POST_WORKOUT', 'ANYTIME', 'AS_NEEDED');

-- AlterTable
ALTER TABLE "CompoundProfile" ADD COLUMN     "customFrequencyDescription" TEXT,
ADD COLUMN     "cycleLengthWeeks" INTEGER,
ADD COLUMN     "daysOff" INTEGER,
ADD COLUMN     "daysOn" INTEGER,
ADD COLUMN     "dosesPerDay" INTEGER,
ADD COLUMN     "dosingFrequency" "DosingFrequency",
ADD COLUMN     "isFdaApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredTime" "PreferredTime",
ADD COLUMN     "restPeriodWeeks" INTEGER,
ADD COLUMN     "timingNotes" TEXT;

-- Numeric bounds validation:
-- dosesPerDay is capped at 8 to allow advanced pulse-mimicry protocols (e.g. GHRP pulses) while maintaining safety.
-- cycleLengthWeeks and restPeriodWeeks are capped at 104 (2 years) to prevent absurd inputs.
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_cycle_length" CHECK ("cycleLengthWeeks" IS NULL OR ("cycleLengthWeeks" >= 1 AND "cycleLengthWeeks" <= 104));
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_rest_period" CHECK ("restPeriodWeeks" IS NULL OR ("restPeriodWeeks" >= 1 AND "restPeriodWeeks" <= 104));
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_doses_per_day" CHECK ("dosesPerDay" IS NULL OR ("dosesPerDay" >= 1 AND "dosesPerDay" <= 8));

-- Co-occurrence rules for weekly schedule:
-- 1. Continuous daily dosing is canonically represented by NULL daysOn and NULL daysOff.
-- 2. Weekly cycles with off days are only valid for DAILY frequency, requiring daysOn/daysOff to be between 1 and 6, and sum to exactly 7 (prohibiting redundant 7/0 or 0/7).
-- 3. Bounds >=1 and <=6 are enforced here, eliminating the need for redundant standalone day bounds constraints.
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_daily_weekly_schedule" CHECK (
  ("daysOn" IS NULL AND "daysOff" IS NULL) OR
  (coalesce("dosingFrequency"::text, '') = 'DAILY' AND "daysOn" IS NOT NULL AND "daysOff" IS NOT NULL AND "daysOn" >= 1 AND "daysOn" <= 6 AND "daysOff" >= 1 AND "daysOff" <= 6 AND "daysOn" + "daysOff" = 7)
);

-- Custom frequency description co-occurrence rules (enforces non-empty trimmed text)
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_custom_frequency_desc" CHECK (
  (coalesce("dosingFrequency"::text, '') = 'CUSTOM' AND "customFrequencyDescription" IS NOT NULL AND length(trim("customFrequencyDescription")) > 0) OR
  (coalesce("dosingFrequency"::text, '') != 'CUSTOM' AND "customFrequencyDescription" IS NULL)
);

-- Doses per day and preferredTime cross-field compatibility check:
-- Clause 1: If dosesPerDay is >= 2, preferredTime must be non-null.
-- Clause 2: If dosesPerDay is 2, preferredTime must be a twice-daily composite or flexible value.
-- Clause 3: If dosesPerDay is 3, preferredTime must be a thrice-daily composite or flexible value.
-- Clause 4: If dosesPerDay is 4 to 8, preferredTime must be ANYTIME or AS_NEEDED.
-- Clause 5: Bans twice-daily composite times when dosesPerDay is not 2.
-- Clause 6: Bans thrice-daily composite times when dosesPerDay is not 3.
-- (coalesce("dosesPerDay", 0) is used to avoid SQL NULL evaluation leaks).
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "chk_doses_per_day_time_alignment" CHECK (
  (coalesce("dosesPerDay", 0) <= 1 OR "preferredTime" IS NOT NULL) AND
  (coalesce("dosesPerDay", 0) != 2 OR coalesce("preferredTime"::text, '') IN ('MORNING_AND_NIGHT', 'PRE_AND_POST_WORKOUT', 'ANYTIME', 'AS_NEEDED')) AND
  (coalesce("dosesPerDay", 0) != 3 OR coalesce("preferredTime"::text, '') IN ('MORNING_AFTERNOON_NIGHT', 'ANYTIME', 'AS_NEEDED')) AND
  (coalesce("dosesPerDay", 0) < 4 OR coalesce("preferredTime"::text, '') IN ('ANYTIME', 'AS_NEEDED')) AND
  (coalesce("preferredTime"::text, '') NOT IN ('MORNING_AND_NIGHT', 'PRE_AND_POST_WORKOUT') OR coalesce("dosesPerDay", 0) = 2) AND
  (coalesce("preferredTime"::text, '') != 'MORNING_AFTERNOON_NIGHT' OR coalesce("dosesPerDay", 0) = 3)
);

