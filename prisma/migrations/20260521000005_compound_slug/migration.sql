-- Add slug nullable first to safely backfill existing rows
ALTER TABLE "Compound" ADD COLUMN "slug" TEXT;
-- Backfill: derive slug from name consistent with nameToSlug() JS function:
-- 1. lowercase, 2. spaces → hyphens, 3. strip non-word chars, 4. collapse multiple hyphens
UPDATE "Compound" SET "slug" = REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(LOWER("name"), '\s+', '-', 'g'),
    '[^\w-]', '', 'g'
  ),
  '-+', '-', 'g'
);
-- Make non-nullable after backfill
ALTER TABLE "Compound" ALTER COLUMN "slug" SET NOT NULL;
-- Unique index (after backfill, so no duplicate-default collision)
CREATE UNIQUE INDEX "Compound_slug_key" ON "Compound"("slug");
