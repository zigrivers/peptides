ALTER TABLE "Compound" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "Compound_slug_key" ON "Compound"("slug");
