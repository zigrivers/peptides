-- Reconcile pre-existing out-of-band schema drift: the `expectedBenefitsSummary`
-- columns and three unique-index renames were applied to databases without a
-- migration in prior work, leaving the migration history behind the live schema
-- (which made `prisma migrate dev` want to reset). This migration captures that
-- drift. It is idempotent so it is safe on any environment regardless of current
-- state: marked already-applied on the dev DB (which already has these changes)
-- via `prisma migrate resolve --applied`, and runs normally on fresh/prod DBs.

ALTER TABLE "CompoundProfile" ADD COLUMN IF NOT EXISTS "expectedBenefitsSummary" TEXT;
ALTER TABLE "SupplementProfile" ADD COLUMN IF NOT EXISTS "expectedBenefitsSummary" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundAdjunctRecommendation_sourceCompoundId_adjunctId_benefi')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundAdjunctRecommendation_sourceCompoundId_adjunctId_be_key') THEN
    ALTER INDEX "CompoundAdjunctRecommendation_sourceCompoundId_adjunctId_benefi" RENAME TO "CompoundAdjunctRecommendation_sourceCompoundId_adjunctId_be_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundAdjunctRecommendationCitation_recommendationId_citation')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundAdjunctRecommendationCitation_recommendationId_cita_key') THEN
    ALTER INDEX "CompoundAdjunctRecommendationCitation_recommendationId_citation" RENAME TO "CompoundAdjunctRecommendationCitation_recommendationId_cita_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundPairing_sourceCompoundId_pairedCompoundName_benefitGoal')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CompoundPairing_sourceCompoundId_pairedCompoundName_benefit_key') THEN
    ALTER INDEX "CompoundPairing_sourceCompoundId_pairedCompoundName_benefitGoal" RENAME TO "CompoundPairing_sourceCompoundId_pairedCompoundName_benefit_key";
  END IF;
END $$;
