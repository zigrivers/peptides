-- CreateTable
CREATE TABLE "CompoundPairing" (
    "id" TEXT NOT NULL,
    "sourceCompoundId" TEXT NOT NULL,
    "pairedCompoundId" TEXT,
    "pairedCompoundName" TEXT NOT NULL,
    "benefitGoal" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "expectedSynergy" TEXT NOT NULL,
    "evidenceQuality" TEXT NOT NULL,
    "safetyCaveats" TEXT NOT NULL,
    "avoidIf" TEXT NOT NULL,
    "timingOrSequencingNotes" TEXT,
    "bestOverall" BOOLEAN NOT NULL DEFAULT false,
    "partnerExistsInCatalog" BOOLEAN NOT NULL DEFAULT true,
    "missingCompoundAction" TEXT NOT NULL DEFAULT 'none',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompoundPairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundPairingCitation" (
    "id" TEXT NOT NULL,
    "pairingId" TEXT NOT NULL,
    "citationId" TEXT NOT NULL,

    CONSTRAINT "CompoundPairingCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompoundPairing_sourceCompoundId_pairedCompoundName_benefitGoal_key" ON "CompoundPairing"("sourceCompoundId", "pairedCompoundName", "benefitGoal");

-- CreateIndex
CREATE INDEX "CompoundPairing_sourceCompoundId_benefitGoal_idx" ON "CompoundPairing"("sourceCompoundId", "benefitGoal");

-- CreateIndex
CREATE INDEX "CompoundPairing_pairedCompoundId_idx" ON "CompoundPairing"("pairedCompoundId");

-- CreateIndex
CREATE UNIQUE INDEX "CompoundPairingCitation_pairingId_citationId_key" ON "CompoundPairingCitation"("pairingId", "citationId");

-- CreateIndex
CREATE INDEX "CompoundPairingCitation_citationId_idx" ON "CompoundPairingCitation"("citationId");

-- AddForeignKey
ALTER TABLE "CompoundPairing" ADD CONSTRAINT "CompoundPairing_sourceCompoundId_fkey" FOREIGN KEY ("sourceCompoundId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundPairing" ADD CONSTRAINT "CompoundPairing_pairedCompoundId_fkey" FOREIGN KEY ("pairedCompoundId") REFERENCES "Compound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundPairingCitation" ADD CONSTRAINT "CompoundPairingCitation_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "CompoundPairing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundPairingCitation" ADD CONSTRAINT "CompoundPairingCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
