-- CreateTable
CREATE TABLE "CatalogAdjunct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "safetyNotes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "CatalogAdjunct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAdjunctCitation" (
    "id" TEXT NOT NULL,
    "adjunctId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "doi" TEXT,
    "pmid" TEXT,

    CONSTRAINT "CatalogAdjunctCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundAdjunctRecommendation" (
    "id" TEXT NOT NULL,
    "sourceCompoundId" TEXT NOT NULL,
    "adjunctId" TEXT NOT NULL,
    "benefitGoal" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "expectedBenefit" TEXT NOT NULL,
    "evidenceQuality" TEXT NOT NULL,
    "safetyCategory" TEXT NOT NULL,
    "safetyCaveats" TEXT NOT NULL,
    "avoidIf" TEXT NOT NULL,
    "implementationNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompoundAdjunctRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundAdjunctRecommendationCitation" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "citationId" TEXT NOT NULL,

    CONSTRAINT "CompoundAdjunctRecommendationCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAdjunct_name_key" ON "CatalogAdjunct"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAdjunct_slug_key" ON "CatalogAdjunct"("slug");

-- CreateIndex
CREATE INDEX "CatalogAdjunct_category_status_idx" ON "CatalogAdjunct"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAdjunctCitation_adjunctId_title_key" ON "CatalogAdjunctCitation"("adjunctId", "title");

-- CreateIndex
CREATE INDEX "CatalogAdjunctCitation_adjunctId_idx" ON "CatalogAdjunctCitation"("adjunctId");

-- CreateIndex
CREATE UNIQUE INDEX "CompoundAdjunctRecommendation_sourceCompoundId_adjunctId_benefitGoal_key" ON "CompoundAdjunctRecommendation"("sourceCompoundId", "adjunctId", "benefitGoal");

-- CreateIndex
CREATE INDEX "CompoundAdjunctRecommendation_sourceCompoundId_benefitGoal_idx" ON "CompoundAdjunctRecommendation"("sourceCompoundId", "benefitGoal");

-- CreateIndex
CREATE INDEX "CompoundAdjunctRecommendation_adjunctId_idx" ON "CompoundAdjunctRecommendation"("adjunctId");

-- CreateIndex
CREATE UNIQUE INDEX "CompoundAdjunctRecommendationCitation_recommendationId_citationId_key" ON "CompoundAdjunctRecommendationCitation"("recommendationId", "citationId");

-- CreateIndex
CREATE INDEX "CompoundAdjunctRecommendationCitation_citationId_idx" ON "CompoundAdjunctRecommendationCitation"("citationId");

-- AddForeignKey
ALTER TABLE "CatalogAdjunctCitation" ADD CONSTRAINT "CatalogAdjunctCitation_adjunctId_fkey" FOREIGN KEY ("adjunctId") REFERENCES "CatalogAdjunct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundAdjunctRecommendation" ADD CONSTRAINT "CompoundAdjunctRecommendation_sourceCompoundId_fkey" FOREIGN KEY ("sourceCompoundId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundAdjunctRecommendation" ADD CONSTRAINT "CompoundAdjunctRecommendation_adjunctId_fkey" FOREIGN KEY ("adjunctId") REFERENCES "CatalogAdjunct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundAdjunctRecommendationCitation" ADD CONSTRAINT "CompoundAdjunctRecommendationCitation_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "CompoundAdjunctRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundAdjunctRecommendationCitation" ADD CONSTRAINT "CompoundAdjunctRecommendationCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "CatalogAdjunctCitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
