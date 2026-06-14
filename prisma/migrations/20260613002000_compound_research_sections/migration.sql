-- Additive, non-destructive. Relax claim to nullable for new per-section notes;
-- legacy per-finding rows keep their claim values untouched.
ALTER TABLE "CompoundResearchNote" ALTER COLUMN "claim" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "CompoundResearchNoteSection" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tier" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CompoundResearchNoteSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CompoundResearchNoteSection_noteId_idx" ON "CompoundResearchNoteSection"("noteId");

CREATE TABLE IF NOT EXISTS "CompoundResearchNoteSectionCitation" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  CONSTRAINT "CompoundResearchNoteSectionCitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CompoundResearchNoteSectionCitation_sectionId_idx" ON "CompoundResearchNoteSectionCitation"("sectionId");

DO $$ BEGIN
  ALTER TABLE "CompoundResearchNoteSection"
    ADD CONSTRAINT "CompoundResearchNoteSection_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "CompoundResearchNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompoundResearchNoteSectionCitation"
    ADD CONSTRAINT "CompoundResearchNoteSectionCitation_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "CompoundResearchNoteSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
