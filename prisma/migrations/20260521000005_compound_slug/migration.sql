-- Add slug nullable first to safely backfill existing rows
ALTER TABLE "Compound" ADD COLUMN "slug" TEXT;
-- Backfill: derive slug from name (lowercase, spaces to hyphens, strip non-word chars)
UPDATE "Compound" SET "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE("name", '\s+', '-', 'g'), '[^\w-]', '', 'g'));
-- Make non-nullable after backfill
ALTER TABLE "Compound" ALTER COLUMN "slug" SET NOT NULL;
-- Unique index (after backfill, so no duplicate-default collision)
CREATE UNIQUE INDEX "Compound_slug_key" ON "Compound"("slug");
