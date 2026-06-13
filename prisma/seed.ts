import { PrismaClient } from '@prisma/client';
import { nameToSlug } from '../lib/reference/domain/slug';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

type SeedCitationRef = {
  title: string;
  url?: string | null;
  doi?: string | null;
  pmid?: string | null;
};

type SeedPairing = {
  sourceCompound: string;
  pairedCompound: string;
  benefitGoal: string;
  rationale: string;
  expectedSynergy: string;
  evidenceQuality: string;
  safetyCaveats: string;
  avoidIf: string;
  timingOrSequencingNotes?: string | null;
  bestOverall: boolean;
  partnerExistsInCatalog: boolean;
  missingCompoundAction: string;
  sortOrder?: number;
  citationRefs: SeedCitationRef[];
};

type SeedAdjunctCitationRef = {
  title: string;
  url?: string | null;
  doi?: string | null;
  pmid?: string | null;
};

type SeedAdjunct = {
  name: string;
  category: string;
  description: string;
  evidenceSummary: string;
  safetyNotes: string;
  citationRefs: SeedAdjunctCitationRef[];
};

type SeedAdjunctRecommendation = {
  sourceCompound: string;
  adjunct: SeedAdjunct;
  benefitGoal: string;
  rationale: string;
  expectedBenefit: string;
  evidenceQuality: string;
  safetyCategory: string;
  safetyCaveats: string;
  avoidIf: string;
  implementationNotes?: string | null;
  sortOrder?: number;
};

function normalizeCompoundName(name: string): string {
  return name.toLowerCase();
}

function pairingFixtureKey(pairing: { pairedCompound: string; benefitGoal: string }): string {
  return `${pairing.pairedCompound}\u0000${pairing.benefitGoal}`;
}

function pairingRowKey(pairing: { pairedCompoundName: string; benefitGoal: string }): string {
  return `${pairing.pairedCompoundName}\u0000${pairing.benefitGoal}`;
}

function citationMatchesRef(
  citation: { title: string; url: string | null; doi: string | null; pmid: string | null },
  ref: SeedCitationRef
): boolean {
  if (ref.url && citation.url === ref.url) return true;
  if (ref.doi && citation.doi === ref.doi) return true;
  if (ref.pmid && citation.pmid === ref.pmid) return true;
  return citation.title === ref.title;
}

function adjunctRecommendationFixtureKey(recommendation: {
  adjunct: { name: string };
  benefitGoal: string;
}): string {
  return `${recommendation.adjunct.name}\u0000${recommendation.benefitGoal}`;
}

function adjunctRecommendationRowKey(recommendation: {
  adjunct: { name: string };
  benefitGoal: string;
}): string {
  return `${recommendation.adjunct.name}\u0000${recommendation.benefitGoal}`;
}

function adjunctCitationMatchesRef(
  citation: { title: string; url: string | null; doi: string | null; pmid: string | null },
  ref: SeedAdjunctCitationRef
): boolean {
  if (ref.url && citation.url === ref.url) return true;
  if (ref.doi && citation.doi === ref.doi) return true;
  if (ref.pmid && citation.pmid === ref.pmid) return true;
  return citation.title === ref.title;
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function tablesExist(tableNames: string[]): Promise<boolean> {
  for (const tableName of tableNames) {
    if (!(await tableExists(tableName))) return false;
  }
  return true;
}

async function syncCompoundPairings(pairingFixtures: SeedPairing[]) {
  if (pairingFixtures.length === 0) return;
  const hasPairingTables = await tablesExist(['CompoundPairing', 'CompoundPairingCitation']);
  if (!hasPairingTables) {
    console.warn('[seed] Skipping compound pairings; pairing tables have not been migrated yet.');
    return;
  }

  const compounds = await prisma.catalogItem.findMany({
    select: { id: true, name: true, slug: true },
  });
  const compoundsByName = new Map(
    compounds.map((compound) => [normalizeCompoundName(compound.name), compound])
  );
  const citations = await prisma.citation.findMany({
    select: { id: true, title: true, url: true, doi: true, pmid: true },
  });

  const pairingsBySource = new Map<string, SeedPairing[]>();
  for (const pairing of pairingFixtures) {
    const existing = pairingsBySource.get(pairing.sourceCompound) ?? [];
    existing.push(pairing);
    pairingsBySource.set(pairing.sourceCompound, existing);
  }

  for (const [sourceCompoundName, sourcePairings] of pairingsBySource.entries()) {
    const sourceCompound = compoundsByName.get(normalizeCompoundName(sourceCompoundName));
    if (!sourceCompound) {
      console.warn(`[seed] Skipping pairings for unknown source compound: ${sourceCompoundName}`);
      continue;
    }

    const desiredKeys = new Set(sourcePairings.map(pairingFixtureKey));
    const existingPairings = await prisma.compoundPairing.findMany({
      where: { sourceCompoundId: sourceCompound.id },
      select: { id: true, pairedCompoundName: true, benefitGoal: true },
    });

    for (const [index, pairing] of sourcePairings.entries()) {
      const pairedCompound = compoundsByName.get(normalizeCompoundName(pairing.pairedCompound));
      const upsertedPairing = await prisma.compoundPairing.upsert({
        where: {
          sourceCompoundId_pairedCompoundName_benefitGoal: {
            sourceCompoundId: sourceCompound.id,
            pairedCompoundName: pairing.pairedCompound,
            benefitGoal: pairing.benefitGoal,
          },
        },
        update: {
          pairedCompoundId: pairedCompound?.id ?? null,
          rationale: pairing.rationale,
          expectedSynergy: pairing.expectedSynergy,
          evidenceQuality: pairing.evidenceQuality,
          safetyCaveats: pairing.safetyCaveats,
          avoidIf: pairing.avoidIf,
          timingOrSequencingNotes: pairing.timingOrSequencingNotes ?? null,
          bestOverall: pairing.bestOverall,
          partnerExistsInCatalog: Boolean(pairedCompound) && pairing.partnerExistsInCatalog,
          missingCompoundAction: pairedCompound ? pairing.missingCompoundAction : 'add_complete_compound',
          sortOrder: pairing.sortOrder ?? index,
        },
        create: {
          sourceCompoundId: sourceCompound.id,
          pairedCompoundId: pairedCompound?.id ?? null,
          pairedCompoundName: pairing.pairedCompound,
          benefitGoal: pairing.benefitGoal,
          rationale: pairing.rationale,
          expectedSynergy: pairing.expectedSynergy,
          evidenceQuality: pairing.evidenceQuality,
          safetyCaveats: pairing.safetyCaveats,
          avoidIf: pairing.avoidIf,
          timingOrSequencingNotes: pairing.timingOrSequencingNotes ?? null,
          bestOverall: pairing.bestOverall,
          partnerExistsInCatalog: Boolean(pairedCompound) && pairing.partnerExistsInCatalog,
          missingCompoundAction: pairedCompound ? pairing.missingCompoundAction : 'add_complete_compound',
          sortOrder: pairing.sortOrder ?? index,
        },
      });

      const desiredCitationIds = pairing.citationRefs
        .map((ref) => citations.find((citation) => citationMatchesRef(citation, ref))?.id)
        .filter((id): id is string => Boolean(id));
      const desiredCitationIdSet = new Set(desiredCitationIds);
      const existingCitationLinks = await prisma.compoundPairingCitation.findMany({
        where: { pairingId: upsertedPairing.id },
        select: { id: true, citationId: true },
      });

      const citationLinksToDelete = existingCitationLinks.filter(
        (link) => !desiredCitationIdSet.has(link.citationId)
      );
      if (citationLinksToDelete.length > 0) {
        await prisma.compoundPairingCitation.deleteMany({
          where: { id: { in: citationLinksToDelete.map((link) => link.id) } },
        });
      }

      const existingCitationIdSet = new Set(existingCitationLinks.map((link) => link.citationId));
      for (const citationId of desiredCitationIds) {
        if (!existingCitationIdSet.has(citationId)) {
          await prisma.compoundPairingCitation.create({
            data: {
              pairingId: upsertedPairing.id,
              citationId,
            },
          });
        }
      }
    }

    const pairingsToDelete = existingPairings.filter(
      (pairing) => !desiredKeys.has(pairingRowKey(pairing))
    );
    if (pairingsToDelete.length > 0) {
      await prisma.compoundPairing.deleteMany({
        where: { id: { in: pairingsToDelete.map((pairing) => pairing.id) } },
      });
    }
  }
}

async function syncAdjunctCitations(adjunctId: string, citationRefs: SeedAdjunctCitationRef[]) {
  const existingCitations = await prisma.catalogAdjunctCitation.findMany({
    where: { adjunctId },
    select: { id: true, title: true, url: true, doi: true, pmid: true },
  });

  const citationsToDelete = existingCitations.filter(
    (citation) => !citationRefs.some((ref) => adjunctCitationMatchesRef(citation, ref))
  );
  if (citationsToDelete.length > 0) {
    await prisma.catalogAdjunctCitation.deleteMany({
      where: { id: { in: citationsToDelete.map((citation) => citation.id) } },
    });
  }

  for (const ref of citationRefs) {
    await prisma.catalogAdjunctCitation.upsert({
      where: {
        adjunctId_title: {
          adjunctId,
          title: ref.title,
        },
      },
      update: {
        url: ref.url ?? null,
        doi: ref.doi ?? null,
        pmid: ref.pmid ?? null,
      },
      create: {
        adjunctId,
        title: ref.title,
        url: ref.url ?? null,
        doi: ref.doi ?? null,
        pmid: ref.pmid ?? null,
      },
    });
  }
}

async function syncCompoundAdjunctRecommendations(adjunctFixtures: SeedAdjunctRecommendation[]) {
  if (adjunctFixtures.length === 0) return;
  const hasAdjunctTables = await tablesExist([
    'CatalogAdjunct',
    'CatalogAdjunctCitation',
    'CompoundAdjunctRecommendation',
    'CompoundAdjunctRecommendationCitation',
  ]);
  if (!hasAdjunctTables) {
    console.warn('[seed] Skipping compound adjuncts; adjunct tables have not been migrated yet.');
    return;
  }

  const compounds = await prisma.catalogItem.findMany({
    select: { id: true, name: true },
  });
  const compoundsByName = new Map(
    compounds.map((compound) => [normalizeCompoundName(compound.name), compound])
  );

  const recommendationsBySource = new Map<string, SeedAdjunctRecommendation[]>();
  for (const recommendation of adjunctFixtures) {
    const existing = recommendationsBySource.get(recommendation.sourceCompound) ?? [];
    existing.push(recommendation);
    recommendationsBySource.set(recommendation.sourceCompound, existing);
  }

  for (const [sourceCompoundName, sourceRecommendations] of recommendationsBySource.entries()) {
    const sourceCompound = compoundsByName.get(normalizeCompoundName(sourceCompoundName));
    if (!sourceCompound) {
      console.warn(`[seed] Skipping adjuncts for unknown source compound: ${sourceCompoundName}`);
      continue;
    }

    const desiredKeys = new Set(sourceRecommendations.map(adjunctRecommendationFixtureKey));
    const existingRecommendations = await prisma.compoundAdjunctRecommendation.findMany({
      where: { sourceCompoundId: sourceCompound.id },
      select: {
        id: true,
        benefitGoal: true,
        adjunct: {
          select: { name: true },
        },
      },
    });

    for (const [index, recommendation] of sourceRecommendations.entries()) {
      const adjunct = await prisma.catalogAdjunct.upsert({
        where: { name: recommendation.adjunct.name },
        update: {
          slug: nameToSlug(recommendation.adjunct.name),
          category: recommendation.adjunct.category,
          description: recommendation.adjunct.description,
          evidenceSummary: recommendation.adjunct.evidenceSummary,
          safetyNotes: recommendation.adjunct.safetyNotes,
          status: 'PUBLISHED',
        },
        create: {
          name: recommendation.adjunct.name,
          slug: nameToSlug(recommendation.adjunct.name),
          category: recommendation.adjunct.category,
          description: recommendation.adjunct.description,
          evidenceSummary: recommendation.adjunct.evidenceSummary,
          safetyNotes: recommendation.adjunct.safetyNotes,
          status: 'PUBLISHED',
        },
      });

      await syncAdjunctCitations(adjunct.id, recommendation.adjunct.citationRefs);
      const adjunctCitations = await prisma.catalogAdjunctCitation.findMany({
        where: { adjunctId: adjunct.id },
        select: { id: true, title: true, url: true, doi: true, pmid: true },
      });

      const upsertedRecommendation = await prisma.compoundAdjunctRecommendation.upsert({
        where: {
          sourceCompoundId_adjunctId_benefitGoal: {
            sourceCompoundId: sourceCompound.id,
            adjunctId: adjunct.id,
            benefitGoal: recommendation.benefitGoal,
          },
        },
        update: {
          rationale: recommendation.rationale,
          expectedBenefit: recommendation.expectedBenefit,
          evidenceQuality: recommendation.evidenceQuality,
          safetyCategory: recommendation.safetyCategory,
          safetyCaveats: recommendation.safetyCaveats,
          avoidIf: recommendation.avoidIf,
          implementationNotes: recommendation.implementationNotes ?? null,
          sortOrder: recommendation.sortOrder ?? index,
        },
        create: {
          sourceCompoundId: sourceCompound.id,
          adjunctId: adjunct.id,
          benefitGoal: recommendation.benefitGoal,
          rationale: recommendation.rationale,
          expectedBenefit: recommendation.expectedBenefit,
          evidenceQuality: recommendation.evidenceQuality,
          safetyCategory: recommendation.safetyCategory,
          safetyCaveats: recommendation.safetyCaveats,
          avoidIf: recommendation.avoidIf,
          implementationNotes: recommendation.implementationNotes ?? null,
          sortOrder: recommendation.sortOrder ?? index,
        },
      });

      const desiredCitationIds = recommendation.adjunct.citationRefs
        .map((ref) => adjunctCitations.find((citation) => adjunctCitationMatchesRef(citation, ref))?.id)
        .filter((id): id is string => Boolean(id));
      const desiredCitationIdSet = new Set(desiredCitationIds);
      const existingCitationLinks = await prisma.compoundAdjunctRecommendationCitation.findMany({
        where: { recommendationId: upsertedRecommendation.id },
        select: { id: true, citationId: true },
      });

      const citationLinksToDelete = existingCitationLinks.filter(
        (link) => !desiredCitationIdSet.has(link.citationId)
      );
      if (citationLinksToDelete.length > 0) {
        await prisma.compoundAdjunctRecommendationCitation.deleteMany({
          where: { id: { in: citationLinksToDelete.map((link) => link.id) } },
        });
      }

      const existingCitationIdSet = new Set(existingCitationLinks.map((link) => link.citationId));
      for (const citationId of desiredCitationIds) {
        if (!existingCitationIdSet.has(citationId)) {
          await prisma.compoundAdjunctRecommendationCitation.create({
            data: {
              recommendationId: upsertedRecommendation.id,
              citationId,
            },
          });
        }
      }
    }

    const recommendationsToDelete = existingRecommendations.filter(
      (recommendation) => !desiredKeys.has(adjunctRecommendationRowKey(recommendation))
    );
    if (recommendationsToDelete.length > 0) {
      await prisma.compoundAdjunctRecommendation.deleteMany({
        where: { id: { in: recommendationsToDelete.map((recommendation) => recommendation.id) } },
      });
    }
  }
}

async function main() {
  // Rename old space-separated name to hyphenated name to avoid unique slug conflicts
  const oldSemax = await prisma.catalogItem.findFirst({
    where: { name: 'NA Semax Amidate' },
  });
  if (oldSemax) {
    await prisma.catalogItem.update({
      where: { id: oldSemax.id },
      data: { name: 'NA-Semax-Amidate' },
    });
    console.log('Successfully renamed "NA Semax Amidate" to "NA-Semax-Amidate".');
  }

  const compounds = [
    {
      name: 'BPC-157',
      iupacName:
        'L-Valyl-L-prolyl-L-prolyl-L-alanyl-glycyl-L-glutaminyl-L-arginyl-L-leucyl-L-phenylalanyl-L-alpha-glutamyl-L-leucyl-L-leucyl-L-tyrosyl-L-leucyl-L-valyl-L-leucyl-L-seryl-L-glutamine',
      synonyms: ['Pentadecapeptide BPC-157'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Activates the FAK-paxillin pathway to accelerate tendon-to-bone healing and cell migration. It upregulates Vascular Endothelial Growth Factor receptor 2 (VEGFR2) expression to promote angiogenesis and endothelial cell proliferation. It also modulates nitric oxide (NO) synthesis (balancing endothelial eNOS and inducible iNOS) to regulate local tissue perfusion and protect gastric mucosal integrity via early growth response 1 (egr-1) and growth hormone receptor signaling.

### The Analogy (The Layman Explanation)
BPC-157 acts like a biological foreman on a construction site. When a tissue (like a tendon, muscle, or gut wall) is injured, the foreman rushes in, turns on the emergency floodlights (VEGF) to build new supply roads (blood vessels), recruits specialized repair workers (fibroblasts), and smooths over communication (nitric oxide) to ensure rebuilding happens quickly and in the right structural order.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate reduction in systemic and localized gastrointestinal inflammation; acceleration of gastric mucosal repair begins (visible in improved digestion).
* **Week 2 (Days 8–14)**: Upregulation of collagen deposition and fibroblast migration; early tendon-to-bone junction stabilization begins.
* **Week 4 (Days 15–28)**: Formation of organized granulation tissue and new microvascular networks; noticeable functional recovery in joints, tendons, or muscles.
* **Week 8 (Days 29–56)**: Enhanced mechanical load-bearing capacity of repaired ligaments; tendon tensile strength increases significantly.
* **Week 12 (Days 57–84)**: Remodeling of scar tissue back to mature, organized fibers; restoration of baseline biomechanical function.`,
      administrationRoutes: ['SubQ', 'IM', 'Oral'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '200', unit: 'mcg', researchBenefits: 'Mild recovery, digestive lining support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Standard tendon, muscle, and gut barrier healing', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Accelerated healing of severe ligament tears or systemic inflammation', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Generally well-tolerated. Mild injection-site redness reported. Safety Assessment: Highly safe profile with no toxicity observed in animal or human trials.',
        stackingNotes: 'Commonly stacked with TB-500 for enhanced musculoskeletal healing. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'BPC-157 and wound healing — rodent model',
            doi: '10.1097/00006123-199709000-00023',
            pmid: '9310004',
          },
          {
            title: 'BPC-157 promotes tendon healing — in vitro study',
            doi: '10.1007/s00421-012-2398-7',
            pmid: '22526625',
          },
        ],
      },
    },
    {
      name: 'TB-500',
      iupacName: null,
      synonyms: ['Thymosin Beta-4', 'Tβ4'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Binds to G-actin to prevent actin polymerization into F-actin, thereby maintaining a pool of monomeric actin. This action drives cellular motility, allowing keratinocytes, fibroblasts, and endothelial cells to migrate rapidly to damaged tissue sites. It also upregulates matrix metalloproteinases (MMPs) to clear tissue paths, promotes angiogenesis, and downregulates pro-inflammatory cytokines (like TNF-alpha and IL-1beta).

### The Analogy (The Layman Explanation)
Imagine a cellular assembly line where structural components (actin) are usually locked together in static blocks. TB-500 acts like a logistics coordinator that keeps these blocks fluid and mobile, enabling repair cells to quickly crawl through the tissue debris to the site of an injury. It's like paving a smooth highway for repair cells to travel on, while simultaneously turning down the alarm systems (cytokines) that cause painful inflammation.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid suppression of localized swelling and inflammatory signaling; reduction in acute joint and muscle stiffness.
* **Week 2 (Days 8–14)**: Accelerated cell migration to injury sites; early stages of muscle fiber repair and microvascular sprouts formation.
* **Week 4 (Days 15–28)**: Substantial deposition of new connective tissue; major improvement in flexibility and reduction in exercise-induced injury discomfort.
* **Week 8 (Days 29–56)**: Structural strengthening of repaired muscle fibers and tendons; near-complete resolution of chronic soft tissue damage.
* **Week 12 (Days 57–84)**: Complete tissue remodeling with mature, aligned collagen and muscle fibers; restoration of full range of motion.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Musculoskeletal maintenance, mild systemic repair', recommendedFrequency: 'Twice weekly' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard connective tissue, tendon, and ligament repair', recommendedFrequency: 'Twice weekly' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Acute loading dose for severe sports injuries or tears', recommendedFrequency: 'Twice weekly' },
        sideEffects: 'Occasional fatigue and mild nausea in higher doses. Safety Assessment: High safety profile. Occasional transient fatigue, headache, or mild lethargy reported in higher doses.',
        stackingNotes: 'Often combined with BPC-157; synergistic healing across tissue types. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Thymosin beta-4 accelerates wound healing',
            doi: '10.1096/fj.09-140046',
            pmid: '20103959',
          },
        ],
      },
    },
    {
      name: 'Semaglutide',
      iupacName: null,
      synonyms: ['Ozempic', 'Wegovy', 'GLP-1 agonist'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A long-acting glucagon-like peptide-1 (GLP-1) receptor agonist that acts with 94% sequence homology to human GLP-1, modified with a C18 diacid spacer to resist DPP-4 degradation. It binds to pancreatic beta-cells to stimulate glucose-dependent insulin secretion, suppresses glucagon release from alpha-cells, slows gastric emptying via vagal pathways, and acts directly on the arcuate nucleus in the hypothalamus to downregulate hunger signals and enhance satiety.

### The Analogy (The Layman Explanation)
Semaglutide functions like a smart thermostat for the body's energy intake. It tells the stomach to slow down its food processing (a slow conveyor belt), ensuring you feel full for much longer. Simultaneously, it sends a constant signal to the brain's appetite control center that the energy tank is full, turning off the intrusive "food noise" that drives cravings and overeating.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate reduction in "food noise" (cravings) and early enhancement of meal-induced satiety; slow gastric emptying begins.
* **Week 2 (Days 8–14)**: Glycemic stabilization with reduced fasting and postprandial glucose levels; early weight loss (primarily water retention and initial fat).
* **Week 4 (Days 15–28)**: Steady state plasma concentrations achieved; weight reduction of 1-3% body weight; sustained satiety.
* **Week 8 (Days 29–56)**: Significant shift in metabolic parameters; average body weight reduction reaches 4-6%; visible improvements in body composition.
* **Week 12 (Days 57–84)**: Up to 8-10% average reduction in body weight; significant reductions in HbA1c levels for glycemic control; metabolic adaptation stabilizes.`,

      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Initial weight management, glycemic adaptation', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated weight loss, metabolic health enhancement', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '2.4', unit: 'mg', researchBenefits: 'Maximum weight management dose', recommendedFrequency: 'Weekly' },
        sideEffects: 'Nausea, vomiting, diarrhoea, constipation, injection-site reactions. Safety Assessment: Gastrointestinal side effects common. Dehydration risk. Must monitor for pancreatitis or gallbladder disease.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Semaglutide and cardiovascular outcomes in obesity (SELECT)',
            doi: '10.1056/NEJMoa2307563',
            pmid: '37952131',
          },
        ],
      },
    },
    {
      name: 'Tirzepatide',
      iupacName: null,
      synonyms: ['Mounjaro', 'GIP/GLP-1 dual agonist'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A dual glucose-dependent insulinotropic polypeptide (GIP) and GLP-1 receptor agonist. It is a lipidated 39-amino-acid peptide based on the native GIP sequence. Tirzepatide activates both receptor pathways, leading to synergistic enhancements in insulin secretion, glucagon suppression, and insulin sensitivity (via GIP action on adipose tissue receptors). It decreases food intake and slows gastric transit more effectively than GLP-1 mono-agonists by recruiting dual signaling pathways in the central nervous system.

### The Analogy (The Layman Explanation)
If Semaglutide is a single volume control knob for appetite, Tirzepatide is a dual-channel stereo control. It uses two separate signals: one channel slows digestion and tells the brain you are full, while the second channel acts directly on fat cells to make them more receptive to insulin and ready to burn energy. By tuning both channels at once, it achieves a deeper reset of the body's metabolic setpoint.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Pronounced and immediate reduction in hunger, cravings, and food noise; immediate stabilization of blood sugar levels.
* **Week 2 (Days 8–14)**: Rapid metabolic adjustments; initial weight loss of 1.5-3% of baseline weight; improved energy stability throughout the day.
* **Week 4 (Days 15–28)**: Establishment of a strong caloric deficit; average body weight reduction of 3-5%; significant enhancement in peripheral insulin sensitivity.
* **Week 8 (Days 29–56)**: 6-8% mean body weight reduction; lipid profiles begin to optimize; metabolic inflammation biomarkers (such as hs-CRP) decrease.
* **Week 12 (Days 57–84)**: Average body weight reduction of 10-12%; major improvements in visceral fat distribution; HbA1c reductions of up to 1.8-2.2%.`,

      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '2.5', unit: 'mg', researchBenefits: 'Initiation dose, glycemic adaptation', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Substantial appetite suppression and weight loss', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '15.0', unit: 'mg', researchBenefits: 'Maximum maintenance dose for profound weight loss and glycemic control', recommendedFrequency: 'Weekly' },
        sideEffects: 'Similar to semaglutide; GI side effects common at initiation. Safety Assessment: Gastrointestinal distress is common during dose escalation. Risk of dehydration. Avoid in patients with a history of Medullary Thyroid Carcinoma (MTC).',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Tirzepatide vs semaglutide for weight loss (SURMOUNT-5)',
            doi: '10.1056/NEJMoa2410819',
            pmid: '39820891',
          },
        ],
      },
    },
    {
      name: 'GHK-Cu',
      iupacName: null,
      synonyms: ['Copper Peptide', 'GHK-Copper'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A naturally occurring tripeptide (glycyl-L-histidyl-L-lysine) complexed with divalent copper (Cu2+). It serves as a signaling vector that facilitates copper uptake into fibroblasts, triggering the gene expression of procollagen, elastin, proteoglycans, and glycosaminoglycans. It modulates tissue remodeling by activating metalloproteinases (MMPs) and their inhibitors (TIMPs), promotes wound healing by attracting macrophages and mast cells, and upregulates superoxide dismutase (SOD1) to act as a powerful antioxidant.

### The Analogy (The Layman Explanation)
GHK-Cu is like an armored delivery truck carrying vital building supplies (copper) directly to the skin's biological construction workers (fibroblasts). Dermal cells need copper to manufacture structural beams (collagen and elastin), but they struggle to import it on their own. GHK-Cu grabs the copper, safely escorts it inside, and tells the cell's machinery to begin building fresh, elastic tissue, while cleaning up age-related rust (free radicals) along the way.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Initial increase in skin hydration and reduction in fine line depth; enhanced microcirculation to local tissues.
* **Week 2 (Days 8–14)**: Upregulation of dermal fibroblasts and collagen type I/III gene expression; early improvements in skin elasticity and barrier function.
* **Week 4 (Days 15–28)**: Visibly improved skin texture, firmness, and tone; 70% of subjects exhibiting increased collagen density; noticeable reduction in fine expression lines.
* **Week 8 (Days 29–56)**: Acceleration of tissue remodeling; reduction in hyperpigmentation and improvement in scar appearance; enhanced hair follicle anchorage (if applied to scalp).
* **Week 12 (Days 57–84)**: Up to 28% subdermal density improvement; structural restructuring of thin, aged skin; long-term dermal collagen density maximized.`,

      administrationRoutes: ['SubQ', 'Topical'],
      tags: ['skin', 'healing', 'longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Skin hydration and cosmetic maintenance', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Advanced dermal collagen promotion and systemic healing', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '3.0', unit: 'mg', researchBenefits: 'Maximum subcutaneous dose for systematic tissue repair', recommendedFrequency: 'Once daily' },
        sideEffects: 'Skin flushing at injection site; generally well-tolerated topically. Safety Assessment: Well-tolerated. SubQ injections often cause a transient stinging sensation and localized redness. High doses may alter zinc-copper balance.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'GHK-Cu and skin remodelling — review',
            doi: '10.1155/2015/648108',
            pmid: '25977840',
          },
        ],
      },
    },
    {
      name: 'Tesamorelin',
      iupacName: null,
      synonyms: ['Egrifta', 'GHRH analogue'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic 44-amino-acid analogue of growth hormone-releasing hormone (GHRH). It binds selectively to GHRH receptors on pituitary somatotropes, triggering the cAMP-dependent pathway to stimulate synthesis and pulsatile release of endogenous growth hormone (GH), which subsequently increases circulating IGF-1. It reduces visceral adipose tissue (VAT) by promoting lipolysis via GH-induced lipase activation.

### The Analogy (The Layman Explanation)
Tesamorelin acts like a biological cheerleader for the pituitary gland. Instead of introducing foreign growth hormone, it encourages the body's natural hormone factories to release a clean wave of growth hormone. It's like sending a specific key that unlocks a vault, releasing growth factors that melt away stubborn deep belly fat (visceral fat) while helping muscles recover.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Improved sleep quality and depth; early reduction in muscle recovery time.
* **Week 2 (Days 8–14)**: Subtle increase in water retention and joint lubrication; cellular metabolism shifts begin.
* **Week 4 (Days 15–28)**: Gradual energy improvement; initial decreases in deep visceral fat stores.
* **Week 8 (Days 29–56)**: Visible changes in body composition with reduced waist circumference; lean tissue conservation.
* **Week 12 (Days 57–84)**: Up to 15% reduction in visceral adipose tissue; peak metabolic improvements and body shape changes.`,
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Fat reduction, general body composition maintenance', recommendedFrequency: 'Daily (5 days on, 2 days off)' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Standard therapeutic GHRH stimulation and visceral fat loss', recommendedFrequency: 'Daily (5 days on, 2 days off)' },
        dosingHigh: { amount: '2.0', unit: 'mg', researchBenefits: 'Maximum approved pituitary stimulation dose', recommendedFrequency: 'Daily' },
        sideEffects: 'Fluid retention, joint pain, injection-site reactions. Safety Assessment: Side effects include fluid retention, joint pain, muscle stiffness, and transient increases in blood glucose. Contraindicated in active cancer.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Tesamorelin for visceral adiposity in HIV-infected adults',
            doi: '10.1056/NEJMoa1007501',
            pmid: '20818872',
          },
        ],
      },
    },
    {
      name: 'Epitalon',
      iupacName: null,
      synonyms: ['Epithalamin', 'Epithalone'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic tetrapeptide (Ala-Glu-Asp-Gly) based on the pineal gland hormone epithalamin. It stimulates telomerase activity in human somatic cells, facilitating the elongation of telomeres. It regulates pineal gland hormone synthesis (upregulating melatonin production) and normalizes pituitary gonadotropic hormones, restoring circadian rhythmicity and reducing age-related immunosenescence.

### The Analogy (The Layman Explanation)
Epitalon acts like a genetic clock restorer. In every cell, our chromosomes have protective caps (telomeres) that get shorter as we age, eventually causing the cell to stop working. Epitalon switches on the cell's maintenance system (telomerase) to rebuild these caps, while resetting the body's internal clock (melatonin) so you sleep deeply and regenerate like a younger person.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Circadian rhythm normalization; deeper sleep cycle; reduction in night-time awakenings.
* **Week 2 (Days 8–14)**: Elevated morning alertness and energy; improved skin cell recovery.
* **Week 4 (Days 15–28)**: Systemic vitality boost; enhanced stress-resilience and immune responses.
* **Week 8 (Days 29–56)**: Improved tissue elasticity and cellular repair; long-term longevity biomarkers optimize.
* **Week 12 (Days 57–84)**: Peak cellular rejuvenation; persistent energy baseline; maximized telomere length protection.`,
      administrationRoutes: ['SubQ', 'IM', 'Intranasal'],
      tags: ['longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Pineal gland maintenance and circadian rhythm regulation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard longevity protocol for telomere elongation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Advanced cellular regeneration and telomerase up-regulation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        sideEffects: 'Generally well-tolerated; minimal adverse effects reported. Safety Assessment: Extremely high safety profile. No toxic, carcinogenic, or adverse effects reported.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Epithalamin and telomere length in ageing — clinical trial',
            doi: '10.1007/s10522-003-3931-z',
            pmid: '14628433',
          },
        ],
      },
    },
    {
      name: 'MOTS-c',
      iupacName: null,
      synonyms: ['Mitochondrial ORF of the 12S rRNA type-c'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A 16-amino-acid peptide encoded by the mitochondrial 12S rRNA gene. It targets skeletal muscle to promote glucose uptake by activating the AMP-activated protein kinase (AMPK) pathway. It upregulates the expression of glucose transporters (GLUT4) and modulates the folate-methionine cycle, reducing metabolic stress and preventing high-fat diet-induced insulin resistance.

### The Analogy (The Layman Explanation)
MOTS-c acts like a cellular personal trainer. It tells your muscle cells to wake up and start burning glucose and fat, activating the cell's energy sensor (AMPK). It's like upgrading the fuel injection system in your car, making sure the engine runs clean, uses fuel efficiently, and doesn't store excess energy as fat.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate boost in physical stamina and aerobic exercise capacity; reduced lactic acid accumulation.
* **Week 2 (Days 8–14)**: Enhanced glucose utilization; metabolic rate shifts; improved insulin sensitivity during meals.
* **Week 4 (Days 15–28)**: Substantial fat burning and reduction of systemic metabolic inflammation; improved lipid profiles.
* **Week 8 (Days 29–56)**: Enhanced muscle mass retention; optimized metabolic health indicators; decreased visceral fat.
* **Week 12 (Days 57–84)**: Peak cellular energy flexibility; complete reset of metabolic homeostasis; long-term insulin sensitivity restored.`,
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'Mitochondrial efficiency, insulin sensitivity support', recommendedFrequency: 'Once or twice weekly' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Metabolic adaptation, athletic endurance enhancement', recommendedFrequency: 'Twice weekly (4-6 week cycle)' },
        dosingHigh: { amount: '15.0', unit: 'mg', researchBenefits: 'Intensive metabolic restoration and insulin resistance treatment', recommendedFrequency: 'Three times weekly' },
        sideEffects: 'Limited human data; rodent studies show excellent tolerability. Transient fatigue/muscle soreness. Safety Assessment: Well-tolerated. Transient fatigue, muscle soreness, or mild headache can occur post-injection.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 6,
        
        freezerShelfLifeMonths: 12,
        
        citations: [
          {
            title: 'MOTS-c regulates insulin resistance and metabolic homeostasis',
            doi: '10.1016/j.cmet.2015.03.009',
            pmid: '25738459',
          },
        ],
      },
    },
    {
      name: 'KPV',
      iupacName: 'L-Lysyl-L-prolyl-L-valine',
      synonyms: ['Lys-Pro-Val'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A C-terminal tripeptide fragment of alpha-melanocyte-stimulating hormone (alpha-MSH). It binds to melanocortin receptors (mainly MC1R and MC3R) to block NF-kB translocation to the nucleus, thereby shutting down the transcription of pro-inflammatory cytokines such as TNF-alpha, IL-1beta, and IL-6. It also modulates cell adhesion molecules and exhibits antimicrobial effects.

### The Analogy (The Layman Explanation)
KPV is like an anti-inflammatory fire extinguisher. When the immune system overreacts, it starts printing inflammatory messages (cytokines). KPV blocks the printing press (NF-kB), putting out the fire in tissues like the gut lining or the skin. It helps the body heal without the redness, swelling, or digestive bloating associated with inflammation.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Reduction in acute gut bloating, digestive cramps, or skin redness; stabilization of mast cells.
* **Week 2 (Days 8–14)**: Healing of the intestinal lining or epidermal barrier; reduction in localized inflammatory swelling.
* **Week 4 (Days 15–28)**: Steady clearance of systemic inflammation; improved tolerance to foods or environmental triggers.
* **Week 8 (Days 29–56)**: Deep remodeling of mucosal and dermal tissues; baseline immune responses stabilize.
* **Week 12 (Days 57–84)**: Complete resolution of chronic inflammatory flare-ups; restoration of healthy gut barrier function.`,
      administrationRoutes: ['SubQ', 'Oral', 'Topical'],
      tags: ['healing', 'recovery', 'inflammation'],
      profile: {
        dosingLow: { amount: '200', unit: 'mcg', researchBenefits: 'Anti-inflammatory, gut barrier repair', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Gut healing, skin recovery, mast cell stabilization', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Severe systemic inflammatory response modulation', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Extremely well-tolerated. Rare injection-site irritation or mild flushing. Safety Assessment: Highly safe, non-toxic, and non-melanogenic (does not trigger tanning). Rare localized injection-site itching.',
        stackingNotes: 'Often stacked with BPC-157 for gut/GI healing and mast cell activation syndrome (MCAS) management. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'KPV reduces intestinal inflammation in rodent models',
            doi: '10.1002/ibd.20144',
            pmid: '17559132',
          },
        ],
      },
    },
    {
      name: 'ARA-290',
      iupacName: 'L-Glutaminyl-L-glutaminyl-L-alpha-glutamyl-L-alanyl-L-valyl-L-alpha-glutamyl-L-alanyl-L-lysyl-L-alpha-glutamyl-L-valyl-L-phenylalanyl-L-serine',
      synonyms: ['Cibinetide', 'ARA290', 'Erythropoietin-derived peptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic 11-amino-acid peptide derived from the structure of erythropoietin (EPO). It binds selectively to the Innate Repair Receptor (IRR) (a heterodimer of the EPO receptor and CD131) but does not bind to the homodimeric EPO receptor. It triggers cytoprotective, anti-inflammatory, and anti-apoptotic pathways, promoting small nerve fiber regeneration without elevating red blood cell count.

### The Analogy (The Layman Explanation)
ARA-290 is like a specialized emergency response unit for damaged nerves. Regular EPO stimulates blood production, which can make the blood too thick. ARA-290 bypasses blood production entirely, binding only to the repair receptors on damaged nerves. It silences pain signals and guides small nerve fibers to regrow, like repair crews patching up frayed electrical wiring.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Initial decrease in neuropathic burning or tingling; improved sleep comfort due to reduced nerve pain.
* **Week 2 (Days 8–14)**: Noticeable decrease in chronic pain intensity; reduced local inflammation in nervous tissues.
* **Week 4 (Days 15–28)**: Small fiber nerve regeneration begins; gradual restoration of sensory feedback.
* **Week 8 (Days 29–56)**: Significant functional improvement in peripheral nerves; average pain scores drop by up to 50%.
* **Week 12 (Days 57–84)**: Near-complete restoration of small fiber nerve density; long-term relief from neuropathic symptoms.`,

      administrationRoutes: ['SubQ', 'IV'],
      tags: ['healing', 'recovery', 'neuropathy'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Neuropathic pain relief, anti-inflammation', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '4.0', unit: 'mg', researchBenefits: 'Small fiber neuropathy, sarcoidosis-associated pain', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '8.0', unit: 'mg', researchBenefits: 'Severe peripheral nerve injury recovery', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild injection site reaction, occasional transient headache. Safety Assessment: High safety profile. No hematological abnormalities (no red blood cell elevation). Mild local irritation or headache can occur.',
        stackingNotes: 'Can be stacked with Epitalon or Thymosin Alpha-1 for overall nerve recovery and immune support. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Cibinetide (ARA-290) in small fiber neuropathy associated with sarcoidosis',
            doi: '10.1016/j.jns.2013.06.012',
            pmid: '23810243',
          },
        ],
      },
    },
    {
      name: 'Cagrilintide/Semaglutide',
      iupacName: null,
      synonyms: ['CagriSema', 'Amylin/GLP-1 receptor co-agonist'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Co-administration of a lipidated dual amylin receptor agonist (cagrilintide) and a GLP-1 receptor agonist (semaglutide). Amylin agonism slows gastric emptying and increases hindbrain-mediated satiety, while GLP-1 agonism stimulates insulin secretion and suppresses glucagon in the pancreas, working together on separate brain areas to maximize weight loss and metabolic control.

### The Analogy (The Layman Explanation)
CagriSema is like a two-pronged team managing a kitchen. One chef (Semaglutide) controls the hunger thermostat and keeps insulin running smoothly. The second chef (Cagrilintide) acts as a physical barrier, slowing down how fast the plate empties and telling your brain you are stuffed. Working together, they cut cravings from two different angles.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate, profound hunger reduction and satiety; food noise completely silenced.
* **Week 2 (Days 8–14)**: Significant reduction in meal sizes; blood glucose fluctuations flatten.
* **Week 4 (Days 15–28)**: Weight loss of 3-5% of baseline; metabolic rate shifts towards fat oxidation.
* **Week 8 (Days 29–56)**: 7-9% weight reduction; visceral fat stores shrink; energy levels remain stable.
* **Week 12 (Days 57–84)**: Up to 12-15% weight loss; major improvements in visceral fat distribution; insulin sensitivity optimized.`,
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Initial weight management, glycaemic control', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated weight loss, metabolic health enhancement', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '2.4', unit: 'mg', researchBenefits: 'Maximum weight management dose', recommendedFrequency: 'Weekly' },
        sideEffects: 'Gastrointestinal side effects (nausea, vomiting, diarrhoea, constipation). Risk of dehydration. Safety Assessment: High incidence of transient GI side effects. Adequate hydration is essential.',
        stackingNotes: 'Do not stack with other GLP-1 agonists. Maintain adequate hydration and caloric structure. Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Cagrilintide plus semaglutide co-administration for weight management: a phase 2 trial',
            doi: '10.1016/S0140-6736(21)01751-7',
            pmid: '34480860',
          },
        ],
      },
    },
    {
      name: 'Retatrutide',
      iupacName: null,
      synonyms: ['LY3437943', 'GIP/GLP-1/glucagon receptor triple agonist'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A single peptide triple agonist targeting GIP, GLP-1, and glucagon (GCGR) receptors. GIP and GLP-1 promote insulin secretion, delay gastric emptying, and suppress appetite. Glucagon receptor activation directly stimulates energy expenditure, lipolysis, and lipid clearance in the liver, counteracting the metabolic slowdown typically associated with caloric restriction.

### The Analogy (The Layman Explanation)
Retatrutide is a triple-action fat burner. While other weight loss medications act as brakes on digestion and appetite, Retatrutide adds an accelerator on your cell's furnaces. It keeps you full, controls blood sugar, and simultaneously tells your body to burn stored fat directly for heat and energy, like running a clean metabolic reset.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Complete elimination of food cravings; mild elevation in resting metabolic rate.
* **Week 2 (Days 8–14)**: Rapid onset of fat loss; blood sugar levels stabilize at optimal levels.
* **Week 4 (Days 15–28)**: 4-6% baseline weight loss; significant reduction in body fat percentages.
* **Week 8 (Days 29–56)**: 10-12% weight reduction; fatty liver biomarkers drop significantly.
* **Week 12 (Days 57–84)**: Average weight loss of 15% or more; profound visceral fat reduction; metabolic profile normalized.`,
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Initiation dose, mild weight reduction', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '4.0', unit: 'mg', researchBenefits: 'Substantial weight loss and insulin resistance reversal', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '12.0', unit: 'mg', researchBenefits: 'Maximum therapeutic weight loss and visceral fat reduction', recommendedFrequency: 'Weekly' },
        sideEffects: 'Transient mild-to-moderate gastrointestinal events, dose-dependent heart rate elevation. Safety Assessment: Dose-dependent GI distress. Monitor heart rate for mild, transient elevations during early weeks.',
        stackingNotes: 'Often monitored closely due to potent energy expenditure increase from glucagon receptor activity. Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Triple–hormone-receptor agonist retatrutide for obesity — phase 2 trial',
            doi: '10.1056/NEJMoa2301972',
            pmid: '37366315',
          },
        ],
      },
    },
    {
      name: 'Thymosin Alpha-1',
      iupacName: null,
      synonyms: ['Tα1', 'Zadaxin', 'Thymalfasin'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
An immunomodulatory peptide consisting of 28 amino acids. It stimulates stem cell differentiation into T-helper and cytotoxic T-cells, enhances NK cell activity, and upregulates major histocompatibility complex (MHC) Class I expression. It balances Th1/Th2 cytokine pathways, promoting a healthy immune response without over-activating inflammation.

### The Analogy (The Layman Explanation)
Thymosin Alpha-1 is like an elite training camp for your immune system. It doesn't blindly boost immune activity (which could cause autoimmune flare-ups); instead, it trains white blood cells to detect and destroy virus-infected or abnormal cells, ensuring your defense system is precise, alert, and balanced.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Activation of dormant T-cells; improvement in baseline cellular immune markers.
* **Week 2 (Days 8–14)**: NK cell cytotoxic activity peaks; increased resistance to viral pathogens.
* **Week 4 (Days 15–28)**: Regulation of inflammatory cytokine balance; reduction in chronic fatigue symptoms.
* **Week 8 (Days 29–56)**: Restructured immune defenses; reduced occurrence of opportunistic infections.
* **Week 12 (Days 57–84)**: Optimization of immune baseline; long-term resilience against chronic viral or fungal stress.`,
      administrationRoutes: ['SubQ'],
      tags: ['immunity', 'healing'],
      profile: {
        dosingLow: { amount: '0.75', unit: 'mg', researchBenefits: 'Prophylactic immune support, general wellness', recommendedFrequency: 'Twice weekly' },
        dosingTypical: { amount: '1.5', unit: 'mg', researchBenefits: 'Active immune system modulation, viral response support', recommendedFrequency: 'Twice weekly' },
        dosingHigh: { amount: '3.0', unit: 'mg', researchBenefits: 'Acute immune support or adjunctive oncology research applications', recommendedFrequency: 'Daily or alternate days' },
        sideEffects: 'Extremely high safety profile. Localized transient erythema at injection site. Safety Assessment: High tolerability. Minimal adverse reactions; localized transient redness at the injection site is common.',
        stackingNotes: 'Pairs well with BPC-157 or LL-37 to bolster tissue regeneration and immune response synergy. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Thymosin alpha-1: a review of its immunomodulatory properties and clinical use',
            doi: '10.2174/138920109787048604',
            pmid: '19149591',
          },
        ],
      },
    },
    {
      name: 'GLOW50',
      iupacName: null,
      synonyms: ['GHK-Cu/Argireline/Leuphasyl', 'Cosmetic Tri-Peptide Blend'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A cosmetic blend combining GHK-Cu (collagen stimulus), Argireline (destabilization of the SNARE complex to relax micro-muscles), and Leuphasyl (modulator of calcium channels to reduce neurotransmitter release in facial muscles).

### The Analogy (The Layman Explanation)
GLOW50 acts like a non-toxic topical shield. GHK-Cu repairs and thickens the skin, while Argireline and Leuphasyl act as gentle dampeners on facial muscle contractions. It's like smoothing out a crumpled sheet while reinforcing the fibers of the fabric from underneath.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate skin hydration and glow; slight relaxation of forehead tension.
* **Week 2 (Days 8–14)**: Smoothing of fine expression lines around the eyes; skin barrier repair begins.
* **Week 4 (Days 15–28)**: Clear reduction in depth of dynamic wrinkles; increased dermal elasticity.
* **Week 8 (Days 29–56)**: Dermal thickness improves; reduction in hyperpigmentation and age spots.
* **Week 12 (Days 57–84)**: Peak skin firmness and structural strength; long-term anti-wrinkle maintenance achieved.`,
      administrationRoutes: ['Topical', 'SubQ'],
      tags: ['skin', 'longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Anti-aging skin tone maintenance, light wrinkle support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Dermal remodeling, reduction in expression lines, collagen boost', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '4.0', unit: 'mg', researchBenefits: 'Rapid skin repair, scar reduction, advanced wrinkle management', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild transient skin redness or dry patches at topical application site. Safety Assessment: Extremely safe. Topical application can cause mild redness or localized peeling. SubQ may cause transient stinging.',
        stackingNotes: 'Can be stacked topically with hyaluronic acid or subcutaneously with Epitalon for systematic longevity benefits. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 1 year (dry blend).',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 6,
        
        freezerShelfLifeMonths: 12,
        
        citations: [
          {
            title: 'Role of cosmetic peptides in skin health',
            doi: '10.1111/jocd.12209',
            pmid: '27181059',
          },
        ],
      },
    },
    {
      name: 'FOXO4-DRI',
      iupacName: null,
      synonyms: ['Senolytic Peptide', 'FOXO4 D-Retro-Inverso'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A retro-inverso D-amino acid peptide that acts as a competitive antagonist of the FOXO4-p53 interaction. By disrupting this binding, it allows p53 to translocate to the cell nucleus and activate the mitochondrial apoptotic pathway specifically in senescent (non-dividing "zombie") cells, leaving healthy cells unharmed.

### The Analogy (The Layman Explanation)
FOXO4-DRI is a target seeker for "zombie cells." As we age, some damaged cells refuse to die, lingering in tissues and releasing inflammatory chemicals that age neighboring cells. FOXO4-DRI sneaks in, cuts the protective shield these zombie cells use, and forces them to commit cell suicide, clearing the way for healthy tissue.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Cellular debris clearing; transient systemic fatigue as the body processes senolytic debris.
* **Week 2 (Days 8–14)**: Systemic inflammation drop; improvement in joint mobility and physical flexibility.
* **Week 4 (Days 15–28)**: Vitality boost; skin structure and tissue recovery indicators improve.
* **Week 8 (Days 29–56)**: Enhanced physical stamina and muscle regeneration; reduction in bio-age markers.
* **Week 12 (Days 57–84)**: Peak senolytic rejuvenation; long-term resolution of chronic cellular aging patterns.`,
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['longevity', 'senolytic'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Mild senescent cell clearance, anti-aging maintenance', recommendedFrequency: 'Every 3 days (3-dose cycle)' },
        dosingTypical: { amount: '3.0', unit: 'mg', researchBenefits: 'Standard senolytic clearance protocol for physiological rejuvenation', recommendedFrequency: 'Every 3 days (3-dose cycle, repeat once a year)' },
        dosingHigh: { amount: '5.0', unit: 'mg', researchBenefits: 'Intensive senescent cell eradication under research surveillance', recommendedFrequency: 'Every 2 days (3-dose cycle)' },
        sideEffects: 'Mild transient kidney stress markers, fatigue, light joint soreness. Safety Assessment: Experimental peptide. Requires monitoring of renal biomarkers (creatinine, BUN) as senescent cell clearance can transiently load kidneys.',
        stackingNotes: 'Can be paired with generic senolytics like Quercetin or Dasatinib to enhance clearance range. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 6,
        
        freezerShelfLifeMonths: 12,
        
        citations: [
          {
            title: 'Targeted apoptosis of senescent cells restores tissue homeostasis',
            doi: '10.1016/j.cell.2017.02.031',
            pmid: '28340339',
          },
        ],
      },
    },
    {
      name: 'DSIP',
      iupacName: null,
      synonyms: ['Delta Sleep-Inducing Peptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A naturally occurring neuromodulatory nonapeptide. It crosses the blood-brain barrier and binds to NMDA and AMPA receptors, normalizing sleep architecture by stimulating slow-wave delta sleep. It modulates cortisol release, decreases oxidative stress, and regulates body temperature and blood pressure.

### The Analogy (The Layman Explanation)
DSIP acts like a lullaby conductor for your brainwaves. Instead of knocking you out like a sedative, it helps your brain enter deep delta sleep—the stage where the body repairs its organs, muscles, and brain networks. It's like turning down the noise and static in a radio station so you can sleep peacefully.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate improvement in sleep latency and deep sleep duration; reduced night-time waking.
* **Week 2 (Days 8–14)**: Decreased morning brain fog; improved waking energy levels; lower stress response.
* **Week 4 (Days 15–28)**: Sleep-wake cycle normalized; baseline cortisol spikes decrease.
* **Week 8 (Days 29–56)**: Better stress coping mechanisms; long-term cardiovascular parameters (e.g. resting HR) improve.
* **Week 12 (Days 57–84)**: Restored sleep architecture baseline; sustained cognitive recovery and sleep quality.`,
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['sleep', 'cognitive', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Improved sleep onset and mild stress reduction', recommendedFrequency: 'Nightly (30-60 mins before sleep)' },
        dosingTypical: { amount: '250', unit: 'mcg', researchBenefits: 'Deep delta-wave sleep induction and muscle recovery', recommendedFrequency: 'Nightly before sleep' },
        dosingHigh: { amount: '500', unit: 'mcg', researchBenefits: 'Severe sleep disorder mitigation, opioid withdrawal research support', recommendedFrequency: 'Nightly before sleep' },
        sideEffects: 'Morning grogginess, lethargy, transient dizziness. Safety Assessment: Safe. Main reported issue is morning grogginess or mild lethargy if injected too late in the evening.',
        stackingNotes: 'Stacks well with Epitalon for comprehensive sleep-wake cycle optimization. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Delta sleep-inducing peptide (DSIP): an overview',
            doi: '10.1016/0149-7634(84)90013-1',
            pmid: '6147775',
          },
        ],
      },
    },
    {
      name: 'Hexarelin',
      iupacName: null,
      synonyms: ['Examorelin', 'GHRP-6 derivative'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic hexapeptide growth hormone secretagogue (GHS). It binds selectively to the GHS-R1a receptor in the brain, driving high-amplitude pulses of GH. In addition, it binds to the CD36 receptor on cardiac cells, promoting myocardial survival, protecting blood vessels, and improving heart muscle contraction.

### The Analogy (The Layman Explanation)
Hexarelin is like a turbocharger for growth hormone and heart protection. It gives a powerful push to the pituitary gland for an immediate release of growth factors, while simultaneously wrapping a protective shield around your cardiovascular system to keep blood vessels flexible and strong.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Major recovery boost; improved deep sleep phases; immediate joint lubrication.
* **Week 2 (Days 8–14)**: Fast repair of minor muscle pulls; increased workout stamina.
* **Week 4 (Days 15–28)**: Cellular fat breakdown increases; skeletal muscles look fuller and harder.
* **Week 8 (Days 29–56)**: Cardioprotective benefits peak; near-complete recovery of lingering tendon injuries.
* **Week 12 (Days 57–84)**: Peak body composition remodeling; sustained recovery benefits; cycle ends to prevent desensitization.`,
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Stimulates mild GH release, metabolic recovery support', recommendedFrequency: 'Once daily before bed' },
        dosingTypical: { amount: '200', unit: 'mcg', researchBenefits: 'Cardioprotection, cellular healing, and fat loss promotion', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '300', unit: 'mcg', researchBenefits: 'Maximum GH surge for tissue recovery and metabolic support', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Increased appetite, elevated prolactin and cortisol levels, injection-site numbness. Safety Assessment: Increases cortisol and prolactin. Causes appetite stimulation. Pituitary desensitization occurs if run without cycles (typically run 4-8 weeks on, 4 weeks off).',
        stackingNotes: 'Often cycled for 4-8 weeks to prevent pituitary desensitization. Pairs well with ModGRF (CJC-1295 without DAC). Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Hexarelin, a GH-releasing peptide, exhibits cardioprotective properties',
            doi: '10.1210/en.2004-1647',
            pmid: '15764610',
          },
        ],
      },
    },
    {
      name: 'Adipotide',
      iupacName: null,
      synonyms: ['FTPP', 'Proapoptotic peptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A homing peptide linked to a pro-apoptotic sequence. It targets prohibitin, a membrane protein upregulated on the blood vessels feeding white adipose tissue. Upon binding, it causes cell death of the fat blood vessels, cutting off the blood supply to fat cells and forcing them to shrink and undergo apoptosis.

### The Analogy (The Layman Explanation)
Adipotide is like a targeted supply blockade for fat cells. Fat deposits require constant blood lines to survive. Adipotide identifies these specific fat-feeding pipelines, shuts them down, and starves the fat cells of nutrients, forcing the body to rapidly consume fat stores for survival.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Early reduction in water weight and decrease in fatty tissues around the abdomen.
* **Week 2 (Days 8–14)**: Visible shrinking of waistline; rapid reduction in subcutaneous and visceral fat.
* **Week 4 (Days 15–28)**: Up to 15-20% reduction in body fat mass; lipolysis peaks; cycle ends to protect kidney function.
* **Week 8 (Days 29–56)**: Gradual stabilization of new body weight; metabolic parameters stabilize.
* **Week 12 (Days 57–84)**: Maintenance phase; long-term consolidation of body composition changes.`,
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Mild targeted fat mass reduction', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '0.5', unit: 'mg', researchBenefits: 'Significant abdominal and visceral fat reduction', recommendedFrequency: 'Once daily (28-day cycle)', },
        dosingHigh: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated fat mass depletion in advanced research models', recommendedFrequency: 'Once daily' },
        sideEffects: 'Renal dysfunction (increased creatinine/BUN), dehydration, lethargy. Safety Assessment: High risk of nephrotoxicity (kidney stress). Must monitor serum creatinine, BUN, and glomerular filtration rate closely. Stacks must prioritize extreme hydration.',
        stackingNotes: 'Must be cycled with frequent laboratory renal monitoring. Stacks well with hydration protocols. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'A peptidomimetic targeting white fat vasculature in obese monkeys',
            doi: '10.1126/scitranslmed.3002621',
            pmid: '22072637',
          },
        ],
      },
    },
    {
      name: 'Testosterone',
      iupacName: '(8R,9S,10R,13S,14S,17S)-17-hydroxy-10,13-dimethyl-1,2,6,7,8,9,11,12,14,15,16,17-dodecahydrocyclopenta[a]phenanthren-3-one',
      synonyms: [
        'T',
        'Test',
        'TRT',
        'Androgen replacement therapy',
        '17 beta-hydroxyandrost-4-en-3-one',
        'Testosterone cypionate',
        'Testosterone enanthate',
        'Testosterone undecanoate',
        'Depo-Testosterone',
        'Xyosted',
        'AndroGel',
        'Natesto',
        'Jatenzo',
        'Aveed',
        'Testopel',
      ],
      sourceVersion: 2,
      lastReviewedAt: new Date('2026-06-09T00:00:00.000Z'),
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Testosterone is the primary endogenous androgen. After entering target tissues it binds androgen receptors directly and can also be converted to dihydrotestosterone (DHT) by 5-alpha reductase or to estradiol by aromatase. The androgen-receptor complex regulates gene transcription involved in male secondary sex characteristics, sexual function, erythropoiesis, skeletal muscle protein turnover, bone mineral maintenance, and fat distribution. Exogenous testosterone suppresses hypothalamic-pituitary-gonadal signaling by reducing LH and FSH, which can reduce intratesticular testosterone and spermatogenesis.

### The Analogy (The Layman Explanation)
Testosterone replacement is like restoring a deficient control signal, not turning the signal above normal. When a man has confirmed hypogonadism, physiologic replacement helps tissues that depend on androgen signaling receive a steadier instruction set. More is not automatically better: pushing levels above the physiologic range raises the likelihood of hematocrit elevation, blood-pressure increases, acne, edema, infertility, and estrogen/DHT-mediated adverse effects.

### Clinical Expected Timeline
* **Week 1 (Days 1-7)**: Serum levels begin moving toward the replacement range; injection-site tolerability, blood pressure, edema, acne, and sleep-apnea symptoms should be watched early.
* **Week 2 (Days 8-14)**: Split-dose injection schedules may reduce peak/trough swings; libido or morning-erection changes may start in responders, but generalized energy and mood are not reliable early endpoints.
* **Week 4 (Days 15-28)**: Many measurable benefits begin around 3-6 weeks; sexual-function response is a stronger signal than nonspecific "vitality" claims.
* **Week 8 (Days 29-56)**: Lean-mass and strength changes remain gradual and training-dependent; hematocrit/hemoglobin may begin rising and fertility suppression is expected.
* **Week 12 (Days 57-84)**: Formal follow-up typically reassesses symptoms, adverse effects, testosterone concentration, hematocrit, blood pressure, and prostate-risk monitoring when indicated; longer-term bone-density endpoints take months to years.`,
      administrationRoutes: ['IM', 'SubQ', 'Topical', 'Oral', 'Nasal', 'Buccal', 'Pellet'],
      tags: ['androgen', 'recovery', 'metabolic', 'endocrine', 'fda-approved', 'fertility-impact', 'monitoring-required'],
      profile: {
        dosingLow: { amount: '50', unit: 'mg', researchBenefits: 'Conservative injectable TRT starting range for confirmed male hypogonadism; titrate to symptoms and serum troughs rather than supraphysiologic targets', recommendedFrequency: 'Once weekly or split twice weekly' },
        dosingTypical: { amount: '100', unit: 'mg', researchBenefits: 'Common physiologic replacement target for testosterone cypionate/enanthate when labs and symptoms support TRT', recommendedFrequency: 'Weekly total dose, often split twice weekly' },
        dosingHigh: { amount: '200', unit: 'mg', researchBenefits: 'Upper therapeutic injection range that should trigger close review of serum testosterone, hematocrit, blood pressure, estradiol symptoms, and adverse effects', recommendedFrequency: 'Weekly total dose or 100 mg twice weekly only with clinician-directed monitoring' },
        sideEffects: 'Common and clinically important risks include acne/oily skin, injection-site pain, edema, gynecomastia or breast tenderness from aromatization, male-pattern hair loss in susceptible users, increased blood pressure, increased hematocrit/hemoglobin or erythrocytosis, worsening untreated sleep apnea, lower urinary tract symptom worsening, mood changes, infertility from LH/FSH suppression, and testicular atrophy. Avoid or defer TRT with active prostate or male breast cancer, uncontrolled erythrocytosis, severe untreated obstructive sleep apnea, uncontrolled heart failure, recent acute coronary syndrome/stroke/revascularization, thrombophilia or unprovoked VTE history, severe liver disease or renal failure, pregnancy exposure risk, desire for near-term fertility without specialist planning, or active anabolic-androgenic steroid misuse.',
        stackingNotes: 'Pairing with hCG may be considered when testicular volume or fertility preservation is a goal, but hCG can raise testosterone and estradiol and still requires semen and hormone monitoring. Aromatase inhibitors should not be treated as routine add-ons; reserve them for clinician-directed management of documented estradiol-mediated symptoms or lab issues. Baseline and follow-up context should include two separate morning testosterone measurements before initiation, LH/FSH when etiology is unclear, hematocrit/hemoglobin, blood pressure, PSA/prostate-risk discussion when age/risk appropriate, lipid/metabolic risk, sleep apnea status, and symptom response. Storage: injectable testosterone cypionate/enanthate products are oil-based sterile solutions and do not require reconstitution. Store at controlled room temperature in the carton/protected from light per product labeling; do not refrigerate or freeze. If crystals appear after cold exposure, warm gently to room temperature and roll/shake as label-directed until dissolved before use. Once punctured, follow the product label, local sterile-use policy, or the 28-day multidose-vial puncture limit when no shorter standard applies.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: null,
        
        freezerShelfLifeMonths: null,
        
        citations: [
          {
            title: 'Testosterone Cypionate Injection prescribing information',
            url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6909596e-4bf7-4e11-8029-b89740a30aec',
          },
          {
            title: 'Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline',
            doi: '10.1210/jc.2018-00229',
            pmid: '29562364',
          },
          {
            title: 'Evaluation and Management of Testosterone Deficiency: AUA Guideline',
            doi: '10.1016/j.juro.2018.03.115',
            pmid: '29601923',
          },
          {
            title: 'Evaluation for and Management of Males with Low Testosterone Recommendations for Use',
            url: 'https://www.va.gov/formularyadvisor/DOC_PDF/CRE_Testosterone_Replacement_Therapy_Clinical_Recommendations_Jan_2026.pdf',
          },
          {
            title: 'Cardiovascular Safety of Testosterone-Replacement Therapy',
            doi: '10.1056/NEJMoa2215025',
            pmid: '37326322',
          },
          {
            title: 'FDA Updates Testosterone Labeling for Blood Pressure and Cardiovascular Risks',
            doi: '10.1001/jama.2025.3240',
            pmid: '40184062',
          },
          {
            title: 'Male hypogonadism: pathogenesis, diagnosis, and management',
            doi: '10.1016/S2213-8587(24)00199-2',
            pmid: '39159641',
          },
          {
            title: 'Testosterone replacement therapy: a review of benefits and risks',
            doi: '10.2147/tcrm.s68932',
            pmid: '25484889',
          },
          {
            title: 'Pharmacology of testosterone replacement therapy preparations',
            doi: '10.21037/tau.2016.07.10',
          },
        ],
      },
    },
    {
      name: 'Tadalafil',
      iupacName: null,
      synonyms: ['Cialis'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A highly selective inhibitor of phosphodiesterase type 5 (PDE5). PDE5 degrades cyclic guanosine monophosphate (cGMP) in smooth muscle cells. By blocking PDE5, Tadalafil maintains high levels of cGMP, leading to continuous nitric oxide-mediated smooth muscle relaxation, vasodilation, and increased tissue blood flow.

### The Analogy (The Layman Explanation)
Tadalafil acts like an automatic valve opener for your blood vessels. When muscles are tense, blood vessels narrow. Tadalafil blocks the chemical (PDE5) that closes the valves, keeping the channels wide open. This ensures a constant, smooth delivery of oxygen and nutrients to tissues, helping muscles pump and recover.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate vascular vasodilation within 1-2 hours of dosing; enhanced muscle pump during workouts.
* **Week 2 (Days 8–14)**: Baseline systemic blood pressure decreases; improved endothelial cell function.
* **Week 4 (Days 15–28)**: Sustained vascular health improvement; improved recovery from high-intensity training.
* **Week 8 (Days 29–56)**: Enhanced prostate and urinary tract health; persistent vessel elasticity.
* **Week 12 (Days 57–84)**: Peak vascular and endothelial recovery; long-term circulatory health stabilized.`,
      administrationRoutes: ['Oral'],
      tags: ['recovery', 'vascular'],
      profile: {
        dosingLow: { amount: '2.5', unit: 'mg', researchBenefits: 'Daily vascular support, mild athletic pump', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard daily dose for continuous vascular and prostate support', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '20.0', unit: 'mg', researchBenefits: 'On-demand acute athletic or erectile dysfunction response', recommendedFrequency: 'Every 36 hours' },
        sideEffects: 'Headache, dyspepsia, back pain, nasal congestion, flushing. Safety Assessment: Extremely safe. Side effects are typically mild. Absolutely contraindicated with organic nitrates due to risk of fatal hypotension.',
        stackingNotes: 'Do NOT combine with organic nitrates/nitric oxide donors due to risk of life-threatening hypotension. Storage: Stored as raw oral powder or liquid solution, stable at room temperature for 180 days (liquid) or 3 years (dry tablets).',
        reconstitutedShelfLifeDays: 180,
        
        fridgeShelfLifeMonths: 60,
        
        freezerShelfLifeMonths: 60,
        
        citations: [
          {
            title: 'Vascular and systemic effects of daily tadalafil administration',
            doi: '10.1111/j.1743-6109.2008.00977.x',
            pmid: '18783431',
          },
        ],
      },
    },
    {
      name: 'Vardenafil',
      iupacName: null,
      synonyms: ['Levitra'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A selective phosphodiesterase type 5 (PDE5) inhibitor. It blocks PDE5 degradation of cGMP, promoting nitric oxide accumulation in vascular smooth muscle. It has a rapid absorption profile, leading to rapid local vasodilation and arterial expansion.

### The Analogy (The Layman Explanation)
Vardenafil is like a rapid-response valve opener for the vascular system. While other PDE5 inhibitors work slowly and persist for days, Vardenafil acts like an immediate, intense surge of blood flow, relaxing vascular walls quickly to supply high pressure and oxygen where it is needed.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Quick onset of vasodilation (30-60 minutes); active for 4-5 hours per dose.
* **Week 2 (Days 8–14)**: Reduced arterial resistance during high-stress cardiovascular efforts.
* **Week 4 (Days 15–28)**: Improved target tissue blood flow; vascular response profiles remain consistent.
* **Week 8 (Days 29–56)**: Enhanced endothelial recovery; local vascular tone optimization.
* **Week 12 (Days 57–84)**: Maintenance of peak acute vascular dilatation capability.`,
      administrationRoutes: ['Oral'],
      tags: ['vascular'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'Mild vasodilation support', recommendedFrequency: 'On-demand' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Standard therapeutic dose for targeted vasodilation', recommendedFrequency: 'On-demand (prior to activity)' },
        dosingHigh: { amount: '20.0', unit: 'mg', researchBenefits: 'Maximum single-dose on-demand response', recommendedFrequency: 'On-demand' },
        sideEffects: 'Headache, dizziness, flushing, visual changes. Safety Assessment: Common effects are headache, flushing, nasal congestion, and visual changes. Contraindicated with nitroglycerin.',
        stackingNotes: 'Contraindicated with nitroglycerin and other nitrates due to profound hypotension risk. Storage: Stable at room temperature for 180 days (liquid) or 3 years (dry tablets).',
        reconstitutedShelfLifeDays: 180,
        
        fridgeShelfLifeMonths: 60,
        
        freezerShelfLifeMonths: 60,
        
        citations: [
          {
            title: 'Efficacy and safety of vardenafil: a review',
            doi: '10.1016/s0022-5347(05)64287-2',
            pmid: '12415053',
          },
        ],
      },
    },
    {
      name: 'Thymalin',
      iupacName: null,
      synonyms: ['Thymus Extract Peptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic thymic peptide dipeptide (L-Glu-L-Trp). It induces the expression of differentiation antigens on T-lymphocytes, promotes cytokine release (IL-2, IFN-gamma), and restores the helper/suppressor T-cell ratio. It also normalizes neuroendocrine-immune interactions.

### The Analogy (The Layman Explanation)
Thymalin is like a reset switch for an aging immune system. It goes to the factory where white blood cells are made and corrects their programming, making sure they don't overreact (causing allergies/inflammation) or underreact (causing infection), keeping your immunity running at peak efficiency.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Elevation of circulating active T-helper lymphocytes; initial regulation of inflammatory cytokine counts.
* **Week 2 (Days 8–14)**: Balanced lymphocyte activity; improved cellular immunity during active infection research.
* **Week 4 (Days 15–28)**: Deep lymphatic tissue recovery; enhanced antibody response.
* **Week 8 (Days 29–56)**: Systemic immune resilience peaks; reduced susceptibility to common viral infections.
* **Week 12 (Days 57–84)**: Restored immunoneuroendocrine baseline; immune rejuvenation benefits persist for up to 6 months.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['immunity', 'longevity'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'General immune system regulation', recommendedFrequency: 'Once daily (10-day cycle)' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Deep immunomodulation, lymphatic system support', recommendedFrequency: 'Once daily (10-day cycle, twice yearly)' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Standard maximum immune rebuilding dose', recommendedFrequency: 'Once daily (10-day cycle)' },
        sideEffects: 'Excellent safety profile; localized redness at injection site. Safety Assessment: High safety profile with virtually no toxicities. Mild localized redness at the injection site.',
        stackingNotes: 'Often stacked side-by-side with Epitalon (run Epitalon in the morning, Thymalin at night) to mimic natural pineal-thymus axis renewal. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Thymalin and Epithalamin clinical trials in gerontology',
            doi: '10.1007/bf02434947',
            pmid: '12510182',
          },
        ],
      },
    },
    {
      name: 'Turinabol',
      iupacName: null,
      synonyms: ['Tbol', 'Oral Turinabol'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
4-chlorodehydromethyltestosterone, an oral anabolic-androgenic steroid. It binds to the androgen receptor, prompting protein synthesis and nitrogen retention. The chlorine substitution prevents aromatization into estrogen and reduces affinity for sex hormone-binding globulin (SHBG), maximizing free active hormones.

### The Analogy (The Layman Explanation)
Turinabol is like a pure structural builder. Unlike other steroids that cause immediate bloating and water retention, Turinabol works silently to build dry, dense muscle fibers. It keeps your hormone carriers (SHBG) busy so your body can use more of its active tissue-repairing compounds.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid reduction in muscle soreness; increased recovery speed and endurance during training.
* **Week 2 (Days 8–14)**: Baseline strength levels rise; muscles look fuller without excess water retention.
* **Week 4 (Days 15–28)**: Noticeable lean dry tissue gains; vascularity increases during exercise.
* **Week 8 (Days 29–56)**: Peak athletic performance and recovery; cycle ends to protect liver health.
* **Week 12 (Days 57–84)**: Maintenance phase; post-cycle recovery to restore natural hormonal baselines.`,
      administrationRoutes: ['Oral'],
      tags: ['androgen', 'recovery'],
      profile: {
        dosingLow: { amount: '10', unit: 'mg', researchBenefits: 'Mild athletic recovery, lean tissue support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '30', unit: 'mg', researchBenefits: 'Significant strength gain and muscle preservation', recommendedFrequency: 'Once daily (4-6 week cycle)' },
        dosingHigh: { amount: '50', unit: 'mg', researchBenefits: 'Maximum performance protocol; high androgen burden', recommendedFrequency: 'Once daily' },
        sideEffects: 'Hepatotoxicity (elevated liver enzymes), lipid strain (reduced HDL), endogenous suppression. Safety Assessment: 17-alpha-alkylated steroid; causes hepatotoxicity. Negatively affects lipid profiles (lowers HDL). Suppresses natural LH feedback loop.',
        stackingNotes: 'Require liver protection supplements (TUDCA/NAC) and standard post-cycle therapy. Storage: Stable at room temperature for up to 3 years.',
        reconstitutedShelfLifeDays: 365,
        
        fridgeShelfLifeMonths: 60,
        
        freezerShelfLifeMonths: 60,
        
        citations: [
          {
            title: 'Turinabol misuse and pharmacological properties',
            doi: '10.1002/dta.1969',
            pmid: '26987483',
          },
        ],
      },
    },
    {
      name: 'Dianabol',
      iupacName: null,
      synonyms: ['Dbol', 'Methandrostenolone', 'Methandienone'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Methandrostenolone, an oral androgen receptor agonist. It dramatically increases nitrogen retention, protein synthesis, and glycogenolysis. It has a high rate of conversion to methylestradiol via aromatase, leading to rapid intracellular fluid accumulation and massive strength jumps.

### The Analogy (The Layman Explanation)
Dianabol is like an emergency flood of muscle-building fuel. It forces cells to retain nitrogen (the essential building block of muscle) and absorb water, inflating muscle cells like balloons. This creates a highly anabolic environment that yields massive strength gains in record time.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Massive weight gain (mostly intracellular water); strength increases significantly; recovery is near-instant.
* **Week 2 (Days 8–14)**: Muscles look much larger and fuller; high joint lubrication and reduction in joint pain.
* **Week 4 (Days 15–28)**: Peak muscle hypertrophy and strength gains; elevated blood pressure due to fluid retention.
* **Week 8 (Days 29–56)**: Cycle concludes to protect liver; transition to post-cycle therapy.
* **Week 12 (Days 57–84)**: Recovery phase; normalization of endogenous hormones and fluid levels.`,
      administrationRoutes: ['Oral'],
      tags: ['androgen', 'recovery'],
      profile: {
        dosingLow: { amount: '15', unit: 'mg', researchBenefits: 'Moderate tissue building, rapid recovery', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '30', unit: 'mg', researchBenefits: 'Pronounced muscle hypertrophy and strength gains', recommendedFrequency: 'Once daily (4-6 week cycle)' },
        dosingHigh: { amount: '50', unit: 'mg', researchBenefits: 'High androgen exposure; rapid water retention and tissue mass', recommendedFrequency: 'Once daily' },
        sideEffects: 'Hepatotoxicity, significant estrogenic conversion (gyno, fluid retention), high blood pressure. Safety Assessment: High hepatotoxicity. Strongly aromatizing; can cause severe estrogenic side effects (gynecomastia, fluid retention, hypertension). Deeply suppressive.',
        stackingNotes: 'Aromatase inhibitor (AI) often required to manage estrogen conversion. Storage: Stable at room temperature for up to 3 years.',
        reconstitutedShelfLifeDays: 365,
        
        fridgeShelfLifeMonths: 60,
        
        freezerShelfLifeMonths: 60,
        
        citations: [
          {
            title: 'Methandrostenolone: effects on muscle mass and performance',
            doi: '10.1136/bjsm.9.2.82',
            pmid: '1138883',
          },
        ],
      },
    },
    {
      name: 'NA-Selank-Amidate',
      iupacName: null,
      synonyms: ['N-Acetyl Selank Amidate'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
An acetylated and amidated version of the heptapeptide Selank (Thr-Lys-Pro-Arg-Pro-Gly-Pro). It modulates the activity of GABAergic systems by binding to GABA receptors, upregulates BDNF expression in the hippocampus, and inhibits the degradation of enkephalins, reducing stress and anxiety.

### The Analogy (The Layman Explanation)
NA-Selank-Amidate is like a mental noise-cancelling headset. It increases the brain's calming signals (GABA) while protecting the body's natural pain-relieving chemicals (enkephalins). It doesn't make you sleepy like a sedative; it simply quietens the background static of anxiety so you can focus.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate reduction in acute anxiety and stress within 15-30 minutes of dosing; improved mental focus.
* **Week 2 (Days 8–14)**: Elevated BDNF levels; improved verbal memory, learning rates, and sensory processing.
* **Week 4 (Days 15–28)**: Complete emotional stability; reduced reactivity to stress triggers; improved sleep quality.
* **Week 8 (Days 29–56)**: Improved long-term cognitive retention; stabilized dopamine and serotonin pathways.
* **Week 12 (Days 57–84)**: Peak neuroprotective adaptation; permanent improvements in stress-coping mechanisms.`,
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'anxiolytic'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild focus improvement and stress reduction', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '300', unit: 'mcg', researchBenefits: 'Anxiolytic response, enhanced learning, and stress coping mechanisms', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '900', unit: 'mcg', researchBenefits: 'Intensive cognitive support and severe anxiety management', recommendedFrequency: 'Three times daily' },
        sideEffects: 'Temporary nasal irritation, mild fatigue. Safety Assessment: Highly safe. Non-sedating, non-addictive. Occasional mild nasal mucosa irritation.',
        stackingNotes: 'Often stacked with Semax to balance cognitive stimulation with anxiolytic relaxation. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Anxiolytic properties of Selank in clinical trials',
            doi: '10.1007/s11055-008-9008-0',
            pmid: '19093226',
          },
        ],
      },
    },
    {
      name: 'HCG',
      iupacName: null,
      synonyms: ['Pregnyl', 'Novarel', 'Human Chorionic Gonadotropin'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Human Chorionic Gonadotropin, a glycoprotein hormone that acts as a luteinizing hormone (LH) receptor agonist. It binds to LH receptors on testicular Leydig cells, mimicking endogenous LH to stimulate the production of intratesticular testosterone and sustain spermatogenesis.

### The Analogy (The Layman Explanation)
HCG is like a backup generator for your hormone factories. When you run external hormones, your brain shuts off the signal to make testosterone, causing your factories to shrink and go dormant. HCG mimics that signal, keeping the generator running so your factories stay active, full, and fertile.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Prevention of testicular shrinkage; stabilization of testicular pressure.
* **Week 2 (Days 8–14)**: Restoration of natural testicular volume; improved baseline energy.
* **Week 4 (Days 15–28)**: Normalization of spermatogenesis; prevention of endocrine crash when transitioning.
* **Week 8 (Days 29–56)**: Continuous hormone pathway protection; optimization of fertility parameters.
* **Week 12 (Days 57–84)**: Peak fertility and testicular restoration; baseline hormone pathways preserved.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['androgen', 'fertility'],
      profile: {
        dosingLow: { amount: '250', unit: 'IU', researchBenefits: 'Maintenance of testicular size and intratesticular testosterone on TRT', recommendedFrequency: 'Every other day' },
        dosingTypical: { amount: '500', unit: 'IU', researchBenefits: 'Preservation of spermatogenesis and fertility support', recommendedFrequency: 'Three times weekly' },
        dosingHigh: { amount: '2000', unit: 'IU', researchBenefits: 'Monotherapy for hypogonadism or fertility restoration cycles', recommendedFrequency: 'Three times weekly' },
        sideEffects: 'Estrogen elevation, gynecomastia, injection-site pain. Safety Assessment: Well tolerated. Can increase estrogen levels due to testicular aromatization (requires monitoring).',
        stackingNotes: 'Crucial adjunct when cycling testosterone to maintain natural LH signaling feedback loop. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Co-administration of HCG with testosterone replacement therapy',
            doi: '10.1016/j.juro.2012.11.027',
            pmid: '23219544',
          },
        ],
      },
    },
    {
      name: 'HMG',
      iupacName: null,
      synonyms: ['Menopur', 'Repronex', 'Human Menopausal Gonadotropin'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Human Menopausal Gonadotropin, consisting of active follicle-stimulating hormone (FSH) and luteinizing hormone (LH) in equal parts. It binds directly to both LH and FSH receptors in the gonads, stimulating ovarian follicle development in females and Sertoli/Leydig cell activity in males.

### The Analogy (The Layman Explanation)
HMG is like a full-spectrum fertilization command. While HCG only mimics the LH signal (testosterone production), HMG supplies both LH and FSH. FSH is the specific instruction manual for sperm and egg production. By supplying both, HMG acts as the ultimate tool for restoring fertility.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Activation of sperm production pathways; early follicle maturation signaling.
* **Week 4 (Days 15–28)**: Early improvements in seminal quality and motility; ovarian development markers rise.
* **Week 8 (Days 29–56)**: Notable recovery in sperm count; restoration of fertility profiles.
* **Week 12 (Days 57–84)**: Significant recovery of spermatogenesis; normal ovulation cycles established in female subjects.
* **Week 24 (Weeks 12–24)**: Peak fertility restoration; complete normalization of seminal parameters.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['fertility'],
      profile: {
        dosingLow: { amount: '75', unit: 'IU', researchBenefits: 'Mild spermatogenesis stimulation', recommendedFrequency: 'Three times weekly' },
        dosingTypical: { amount: '150', unit: 'IU', researchBenefits: 'Standard fertility protocol for severe azoospermia recovery', recommendedFrequency: 'Three times weekly' },
        dosingHigh: { amount: '150', unit: 'IU', researchBenefits: 'Standard maximum induction protocol', recommendedFrequency: 'Alternate days' },
        sideEffects: 'Abdominal pain, local site reaction, ovarian hyperstimulation in female subjects. Safety Assessment: Well-tolerated. Risk of Ovarian Hyperstimulation Syndrome (OHSS) in females. In males, rare mild gynecomastia.',
        stackingNotes: 'Often combined with HCG for comprehensive LH + FSH fertility recovery protocols. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'HMG and HCG combination therapy for male hypogonadotropic hypogonadism',
            doi: '10.1002/j.1939-4640.2005.tb02890.x',
            pmid: '15764047',
          },
        ],
      },
    },
    {
      name: 'LL-37',
      iupacName: null,
      synonyms: ['Cathelicidin antimicrobial peptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A 37-amino-acid cathelicidin-derived antimicrobial peptide. It binds to bacterial membranes, forming pores that cause cell lysis. It neutralizes bacterial endotoxins (LPS) and acts as a chemoattractant for immune cells, promoting angiogenesis and re-epithelialization during wound healing.

### The Analogy (The Layman Explanation)
LL-37 is like a targeted search-and-destroy team. When pathogens invade, LL-37 punches holes in their outer walls to neutralize them. At the same time, it acts as a beacon, calling in immune cells to clear up the debris and laying down new cells to seal and heal the wound.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid clearing of localized pathogens; suppression of bacterial colonization in open wounds.
* **Week 2 (Days 8–14)**: Accelerated tissue closure; local inflammation subsides; new skin layers form.
* **Week 4 (Days 15–28)**: Complete tissue healing with minimal scarring; local immune defense systems optimize.
* **Week 8 (Days 29–56)**: Systemic immune regulation; eradication of stubborn bio-film forming pathogens.
* **Week 12 (Days 57–84)**: Complete restoration of skin or mucosal defense barriers; long-term tissue resilience.`,
      administrationRoutes: ['SubQ', 'Topical'],
      tags: ['healing', 'immunity'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Local wound healing, general immune system priming', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '250', unit: 'mcg', researchBenefits: 'Broad-spectrum antimicrobial protection and tissue repair', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '500', unit: 'mcg', researchBenefits: 'Acute intervention for systemic pathogen exposure research', recommendedFrequency: 'Once daily' },
        sideEffects: 'Injection site pain, risk of localized inflammatory reactions. Safety Assessment: Can cause significant stinging or burning at the injection site. Local inflammatory skin reactions are common.',
        stackingNotes: 'Pairs well with BPC-157 to target localized tissue infection and speed recovery. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'The role of LL-37 in wound healing and immune response',
            doi: '10.1111/j.1600-0625.2008.00742.x',
            pmid: '18557934',
          },
        ],
      },
    },
    {
      name: 'Selank',
      iupacName: null,
      synonyms: ['Tuftsin analog'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic heptapeptide (Thr-Lys-Pro-Arg-Pro-Gly-Pro) derived from the immunomodulatory peptide tuftsin. It modulates GABAergic neurotransmission, upregulates hippocampal BDNF, and stabilizes monoamine neurotransmitters (serotonin and dopamine) without causing sedative or addictive side effects.

### The Analogy (The Layman Explanation)
Selank is like a biological buffer against stress. It doesn't sedate you like a tranquilizer; it simply amplifies your brain's natural calming signals (GABA) and protects neurotransmitters, helping you stay cool, collected, and sharp under high-pressure scenarios.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate reduction in acute anxiety and stress within 15-30 minutes; improved sleep onset.
* **Week 2 (Days 8–14)**: Enhanced focus, processing speed, and mental stamina; reduced emotional fatigue.
* **Week 4 (Days 15–28)**: Stabilized emotional response baseline; chronic anxiety symptoms drop significantly.
* **Week 8 (Days 29–56)**: Restored neurotransmitter balances; enhanced memory storage and retrieval.
* **Week 12 (Days 57–84)**: Peak neuroprotective adaptation; permanent improvements in stress-coping mechanisms.`,
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'anxiolytic'],
      profile: {
        dosingLow: { amount: '250', unit: 'mcg', researchBenefits: 'Mild anxiety mitigation', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Anxiety relief, cognitive stability, and mood enhancement', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Severe anxiety control, post-stress cognitive stabilization', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Excellent tolerability profile. Rare local nasal discomfort. Safety Assessment: Non-sedating anxiolytic. High safety. Nasal irritation is rare.',
        stackingNotes: 'Often stacked with BPC-157 for gut-brain axis normalization. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Selank heptapeptide reduces anxiety: clinical and animal studies',
            doi: '10.1007/s11055-007-0047-y',
            pmid: '18084478',
          },
        ],
      },
    },
    {
      name: 'Sermorelin',
      iupacName: null,
      synonyms: ['Geref', 'GRF 1-29'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic 29-amino-acid peptide corresponding to the amino-terminal segment of GHRH. It binds selectively to GHRH receptors on pituitary somatotropes, triggering the cAMP pathway to stimulate release of growth hormone in a natural pulsatile manner, preserving pituitary safety feedback loops.

### The Analogy (The Layman Explanation)
Sermorelin is like a gentle alarm clock for your body's growth hormone factory. Instead of flooding your system with artificial growth hormone (which makes the factory go to sleep), Sermorelin knocks on the door and asks the pituitary to make its own natural waves of youth and recovery.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Enhanced REM sleep and sleep depth; increased dreaming; faster recovery from training.
* **Week 2 (Days 8–14)**: Improved skin hydration; reduction in morning joint stiffness.
* **Week 4 (Days 15–28)**: Subcutaneous fat burning begins; improved muscle tone and daily energy.
* **Week 8 (Days 29–56)**: Visible improvements in body composition; hair and nail growth rates increase.
* **Week 12 (Days 57–84)**: Peak metabolic optimization; structural joint recovery; vitality baseline maximized.`,
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Anti-aging GHRH replacement support', recommendedFrequency: 'Nightly before sleep' },
        dosingTypical: { amount: '200', unit: 'mcg', researchBenefits: 'Pituitary support, fat metabolism optimization, muscle recovery', recommendedFrequency: 'Nightly before sleep' },
        dosingHigh: { amount: '300', unit: 'mcg', researchBenefits: 'Accelerated tissue recovery and energy expenditure', recommendedFrequency: 'Nightly before sleep' },
        sideEffects: 'Flushing, injection-site itching, transient dizziness. Safety Assessment: Facial flushing, injection-site itching, and temporary lightheadedness can occur immediately post-injection.',
        stackingNotes: 'Frequently stacked with Ipamorelin for synergistic pulsatile GH release. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Sermorelin (GRF 1-29) in aging: growth hormone secretagogue overview',
            doi: '10.2147/cia.s113',
            pmid: '18728706',
          },
        ],
      },
    },
    {
      name: 'Snap-8',
      iupacName: null,
      synonyms: ['Octapeptide-3', 'Anti-wrinkle octapeptide'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
An octapeptide anti-wrinkle agent (acetyl glutamyl-glutamyl-methionyl-glutaminyl-arginyl-arginyl-alanyl-alaninamide). It binds to the SNAP-25 protein, disrupting the assembly of the SNARE complex. This prevents vesicle fusion and inhibits acetylcholine release at the neuromuscular junction, relaxing facial muscles.

### The Analogy (The Layman Explanation)
Snap-8 is like a temporary signal block on a telephone line. When you squint or frown, your brain sends a message telling facial muscles to contract. Snap-8 blocks that message at the muscle entrance, allowing the skin above to relax and smooth out, preventing deep expression lines from forming.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Subtle softening of facial tension; skin feels more relaxed.
* **Week 2 (Days 8–14)**: Fine expression lines around eyes and forehead begin to smooth out.
* **Week 4 (Days 15–28)**: Depth of dynamic wrinkles decreases by up to 35%; skin looks noticeably smoother.
* **Week 8 (Days 29–56)**: Prevention of new wrinkle formation; skin looks refreshed and youthful.
* **Week 12 (Days 57–84)**: Peak anti-wrinkle results; long-term dermal smoothing maintenance.`,
      administrationRoutes: ['Topical'],
      tags: ['skin'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Fine line prevention', recommendedFrequency: 'Twice daily' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Expression wrinkle reduction around eyes and forehead', recommendedFrequency: 'Twice daily' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Advanced deep-set facial line reduction', recommendedFrequency: 'Twice daily' },
        sideEffects: 'None significant topically. Localized dryness if over-applied. Safety Assessment: Extremely safe. Topical use only; may cause mild dryness or redness if over-applied on sensitive skin.',
        stackingNotes: 'Often stacked with Copper Peptide (GHK-Cu) for comprehensive anti-aging skin protocols. Storage: Reconstituted solution is stable refrigerated for 60 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 60,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Anti-wrinkle efficacy of a novel octapeptide (Snap-8) in cosmetics',
            doi: '10.1111/j.1468-2494.2009.00490.x',
            pmid: '19467066',
          },
        ],
      },
    },
    {
      name: 'HGH',
      iupacName: null,
      synonyms: ['Humatrope', 'Genotropin', 'Human Growth Hormone', 'Somatropin'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A 191-amino-acid single-chain polypeptide hormone. It binds to the growth hormone receptor (GHR), activating the JAK2/STAT5 pathway. This stimulates the transcription of IGF-1 in liver and peripheral tissues, promoting cellular mitosis, protein synthesis, and lipid oxidation.

### The Analogy (The Layman Explanation)
HGH is the master hormone for growth, repair, and cell renewal. It acts like a general contractor that speeds up all repair work in the body. It tells cells to build protein, tells fat cells to release energy, and tells tissues to regenerate, keeping the body in a state of constant repair and recovery.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid improvement in sleep quality; enhanced cellular hydration and joint comfort.
* **Week 2 (Days 8–14)**: Faster recovery from intense exercise; minor injuries heal quickly.
* **Week 4 (Days 15–28)**: Fat loss begins, especially around the abdomen; skin looks thicker and smoother.
* **Week 8 (Days 29–56)**: Improved lean muscle tone; joint pain resolves; athletic endurance increases.
* **Week 12 (Days 57–84)**: Profound changes in body composition; structural renewal of bones and connective tissues.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['longevity', 'recovery', 'metabolic'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'IU', researchBenefits: 'Hormone replacement, cellular protection, skin tone improvement', recommendedFrequency: 'Daily' },
        dosingTypical: { amount: '2.0', unit: 'IU', researchBenefits: 'Body composition normalization, fat loss, tissue recovery', recommendedFrequency: 'Daily' },
        dosingHigh: { amount: '4.0', unit: 'IU', researchBenefits: 'Advanced sports medicine musculoskeletal recovery', recommendedFrequency: 'Daily' },
        sideEffects: 'Carpal tunnel syndrome, water retention, joint pain, elevated fasting glucose. Safety Assessment: Fluid retention, joint pain, carpal tunnel symptoms, and elevated fasting glucose. Regular glucose screening is recommended.',
        stackingNotes: 'Monitor blood glucose levels regularly. Can be combined with thyroid hormones (T3) or low-dose insulin in professional settings. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Growth hormone replacement therapy in adults: consensus guidelines',
            doi: '10.1210/jc.2011-1251',
            pmid: '21832115',
          },
        ],
      },
    },
    {
      name: 'Semax',
      iupacName: null,
      synonyms: ['ACTH 4-10 analog'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic heptapeptide (Met-Glu-His-Phe-Pro-Gly-Pro) modeled on ACTH(4-10). It crosses the blood-brain barrier to upregulate mRNA levels of Brain-Derived Neurotrophic Factor (BDNF) and Nerve Growth Factor (NGF) in the hippocampus, modulating melanocortin systems to protect neurons.

### The Analogy (The Layman Explanation)
Semax is like a neural shield and battery booster. It prompts the brain to release growth factors (BDNF) that feed and repair brain cells. It protects neurons from oxygen deprivation and stress, helping you maintain clear, focused thinking and sharp recall even during intense workloads.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate improvements in focus, verbal recall, and mental stamina; reduced brain fog.
* **Week 2 (Days 8–14)**: Enhanced hippocampal learning capacity; faster information processing.
* **Week 4 (Days 15–28)**: Long-term memory consolidation; improved neural resilience under high stress.
* **Week 8 (Days 29–56)**: Persistent cognitive endurance; protection against neurological fatigue.
* **Week 12 (Days 57–84)**: Optimized neural connectivity; long-term cognitive baseline maximized.`,
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'longevity'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild focus improvement and cognitive support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '300', unit: 'mcg', researchBenefits: 'Enhanced learning, focus, memory recall, and neuroprotection', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '900', unit: 'mcg', researchBenefits: 'Post-stroke rehabilitation or severe cognitive impairment support', recommendedFrequency: 'Three times daily' },
        sideEffects: 'Mild temporary hair loss (rare, linked to BDNF kinetics in predisposed subjects). Safety Assessment: Very safe. Non-stimulating, non-addictive. Rare reports of temporary mild hair loss.',
        stackingNotes: 'Often stacked with Selank to balance cognitive stimulation with anxiolytic relaxation. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        
        fridgeShelfLifeMonths: 12,
        
        freezerShelfLifeMonths: 24,
        
        citations: [
          {
            title: 'Semax regulates BDNF and NGF expression in ischemic brain',
            doi: '10.1007/s10517-009-0714-3',
            pmid: '19707613',
          },
        ],
      },
    },
    {
      name: 'NA-Semax-Amidate',
      iupacName: 'N-Acetyl-L-methionyl-L-glutamyl-L-histidyl-L-phenylalanyl-L-prolyglycyl-L-prolinamide',
      synonyms: ['N-Acetyl Semax Amidate', 'NASA'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A heptapeptide analog of ACTH(4-10) modified with N-acetyl and C-terminal amide groups for increased blood-brain barrier permeability and enzymatic stability. It rapidly upregulates the mRNA expression of Brain-Derived Neurotrophic Factor (BDNF) and Nerve Growth Factor (NGF) in the hippocampus. It modulates melanocortin receptors (MC3 and MC4) to regulate neuroinflammation and protects dopamine and serotonin transporter systems under ischemic or toxic stress.

### The Analogy (The Layman Explanation)
NA Semax Amidate acts like a high-octane fertilizer for brain cells. When brain cells are tired, stressed, or trying to learn, they need neurotrophic factors (like BDNF) to sprout new branches and make strong connections. Semax triggers a rapid burst of this fertilizer, helping your neural network build new pathways (learning and memory) quickly, while keeping dopamine and serotonin levels stable to prevent brain fog and stress.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Sharp increase in daily mental clarity, focus, and working memory within 30–60 minutes of dosing; reduction in afternoon brain fog.
* **Week 2 (Days 8–14)**: Upregulation of hippocampal BDNF/NGF levels; enhanced rate of learning, verbal recall, and information processing.
* **Week 4 (Days 15–28)**: Stabilization of synaptic plasticity and neural network connectivity; sustained cognitive endurance during intense mental tasks.
* **Week 8 (Days 29–56)**: Significant improvement in long-term memory retrieval; neuroprotective adaptation against stress and toxic brain fatigue.
* **Week 12 (Days 57–84)**: Permanent neural pathway optimization; peak cognitive stamina; restoration of compromised dopamine/serotonin baselines.`,
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['nootropics', 'cognitive'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild cognitive enhancement and daily alertness boost', recommendedFrequency: 'Once daily in the morning' },
        dosingTypical: { amount: '300', unit: 'mcg', researchBenefits: 'Enhanced working memory, focus, and neuroprotective support', recommendedFrequency: 'Once daily in the morning' },
        dosingHigh: { amount: '600', unit: 'mcg', researchBenefits: 'Acute recovery from neurological fatigue or intense study/workload', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild nasal irritation (if intranasal), overstimulation, mild anxiety, or temporary sleep onset disturbance if taken late in the day.',
        stackingNotes: 'Often stacked with Selank for a balanced cognitive and anxiolytic profile. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Semax prevents learning and memory deficits',
            doi: '10.1016/j.bbr.2007.03.018',
            pmid: '17451821',
          },
        ],
      },
    },
    {
      name: 'NAD+',
      iupacName: '[[(2R,3S,4R,5R)-5-(6-aminopurin-9-yl)-3,4-dihydroxyoxolan-2-yl]methoxy-hydroxyphosphoryl] [(2R,3S,4R,5R)-5-(3-carbamoylpyridin-1-yl)-3,4-dihydroxyoxolan-2-yl]methyl hydrogen phosphate',
      synonyms: ['Coenzyme I', 'Nicotinamide Adenine Dinucleotide oxidized form'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
Nicotinamide Adenine Dinucleotide (oxidized) is a fundamental coenzyme found in all living cells. It acts as a primary electron carrier in glycolysis, the Krebs cycle, and the mitochondrial electron transport chain, facilitating ATP synthesis. Additionally, it serves as an obligatory substrate for sirtuins (SIRT1-7) which regulate gene expression and mitochondrial biogenesis, and for PARP enzymes which coordinate DNA damage repair.

### The Analogy (The Layman Explanation)
Think of NAD+ as the essential battery fluid inside every single cell. As we age, this battery fluid dries up, causing our cellular engines (mitochondria) to misfire, lose energy, and let damage build up. Restoring NAD+ is like refilling the battery fluid, allowing the cellular power plants to generate clean energy (ATP) again, while turning on the cell's built-in maintenance crew (sirtuins) to repair damaged DNA.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid elevation of cellular NAD+ pools; improvement in daily mental focus, physical energy levels, and afternoon cognitive fatigue.
* **Week 2 (Days 8–14)**: Upregulation of mitochondrial efficiency; improved sleep depth and morning alertness; faster systemic recovery after physical stress.
* **Week 4 (Days 15–28)**: Cellular repair enzymes (PARP) and sirtuins (SIRT1/3) operate at optimal levels; metabolic flexibility improves; baseline systemic inflammation markers decline.
* **Week 8 (Days 29–56)**: Mitochondrial copy numbers increase (biogenesis); notable improvement in insulin sensitivity and lipid metabolism; enhanced overall stamina.
* **Week 12 (Days 57–84)**: Systemic cellular rejuvenation; persistent cognitive clarity; overall reduction in biological age biomarkers; optimized energy homeostasis.`,
      administrationRoutes: ['SubQ', 'IM', 'IV'],
      tags: ['longevity', 'energy', 'cellular-repair'],
      profile: {
        dosingLow: { amount: '25', unit: 'mg', researchBenefits: 'Mitochondrial support, subtle energy enhancement', recommendedFrequency: 'Twice weekly' },
        dosingTypical: { amount: '50', unit: 'mg', researchBenefits: 'Enhanced stamina, mental clarity, and longevity support', recommendedFrequency: 'Daily or every other day' },
        dosingHigh: { amount: '100', unit: 'mg', researchBenefits: 'Advanced cellular regeneration and recovery from severe fatigue', recommendedFrequency: 'Once daily' },
        sideEffects: 'Temporary flushing sensation, mild nausea, muscle soreness, or injection site irritation.',
        stackingNotes: 'Often paired with Trimethylglycine (TMG) to support liver methylation pathways. Storage: Reconstituted solution is stable refrigerated for 60 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 60,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'NAD+ metabolism and its roles in cellular processes during ageing',
            doi: '10.1038/s41580-020-00313-x',
            pmid: '33299159',
          },
        ],
      },
    },
    {
      name: 'Oxytocin',
      iupacName: '1-{[((4R,7S,10S,13S,16S,19R)-19-amino-7-(2-amino-2-oxoethyl)-10-(3-amino-3-oxopropyl)-13-benzyl-16-(4-hydroxybenzyl)-6,9,12,15,18-pentaoxo-1,2-dithia-5,8,11,14,17-pentaazacycloicosan-4-yl)carbonyl]-L-prolyl-L-leucylglycinamide}',
      synonyms: ['Love Hormone', 'Pitocin'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A 9-amino-acid peptide hormone and neuropeptide. It binds to G-protein coupled oxytocin receptors in the amygdala, ventral striatum, and prefrontal cortex. It downregulates amygdala activity to suppress fear and anxiety, increases release of dopamine and serotonin, and modulates social communication.

### The Analogy (The Layman Explanation)
Oxytocin is the brain's social smoothing agent. It acts like a high-end volume dial that turns down stress and threat detection in the brain's alarm system (the amygdala). By making the brain feel safe, it increases feelings of trust, warmth, and connection with others.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate reduction in social anxiety and feelings of isolation within 30-60 minutes of dosing.
* **Week 2 (Days 8–14)**: Improved social communication and empathy; reduced daily stress responses.
* **Week 4 (Days 15–28)**: Enhanced emotional bonding and relationship quality; lower daily cortisol levels.
* **Week 8 (Days 29–56)**: Lower baseline blood pressure; sustained emotional resilience.
* **Week 12 (Days 57–84)**: Complete stabilization of mood and stress-response pathways.`,
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['mood', 'social-bonding'],
      profile: {
        dosingLow: { amount: '5', unit: 'mcg', researchBenefits: 'Subtle anxiety relief and mood softening', recommendedFrequency: 'As needed' },
        dosingTypical: { amount: '10', unit: 'mcg', researchBenefits: 'Heightened social empathy, trust, and stress reduction', recommendedFrequency: 'As needed' },
        dosingHigh: { amount: '20', unit: 'mcg', researchBenefits: 'Deep emotional regulation and post-stress recovery', recommendedFrequency: 'Once daily as needed' },
        sideEffects: 'Mild headache, facial flushing, transient nausea, or slight drowsiness.',
        stackingNotes: 'Used strategically before social engagements. Keep cold. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Oxytocin pathways and the evolution of human behavior',
            doi: '10.1111/j.1749-6632.2011.06137.x',
            pmid: '22129045',
          },
        ],
      },
    },
    {
      name: 'GHRP-2',
      iupacName: 'D-alanyl-3-(naphthalen-2-yl)-D-alanyl-L-alanyl-L-tryptophyl-D-phenylalanyl-L-lysinamide',
      synonyms: ['Pralmorelin', 'Growth Hormone Releasing Peptide 2'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic growth hormone secretagogue receptor (GHS-R1a) agonist. It activates the phospholipase C (PLC) pathway in somatotropes, triggering intracellular calcium release and high-amplitude growth hormone pulses. It also acts centrally to stimulate mild appetite and cortisol release.

### The Analogy (The Layman Explanation)
GHRP-2 is a high-amplitude alarm clock for growth hormone. It binds to the same receptors that ghrelin (the hunger hormone) uses, triggering a strong, clean release of growth hormone. It also gives a mild boost to appetite, making it excellent for athletes who need to eat and recover.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Improved sleep depth; mild appetite increase; immediate reduction in muscle soreness.
* **Week 2 (Days 8–14)**: Accelerated recovery from workouts; improved joint lubrication.
* **Week 4 (Days 15–28)**: Muscle fullness increases; initial fat loss visible; improved skin elasticity.
* **Week 8 (Days 29–56)**: Enhanced recovery from chronic injuries; noticeable changes in lean body mass.
* **Week 12 (Days 57–84)**: Peak body composition remodeling; cycle concludes to prevent pituitary desensitization.`,
      administrationRoutes: ['SubQ'],
      tags: ['growth-hormone', 'recovery', 'muscle'],
      profile: {
        dosingLow: { amount: '50', unit: 'mcg', researchBenefits: 'Basal growth hormone pulse support and recovery maintenance', recommendedFrequency: '1-2 times daily on empty stomach' },
        dosingTypical: { amount: '100', unit: 'mcg', researchBenefits: 'Optimal pulsatile growth hormone release and fat loss signals', recommendedFrequency: '2-3 times daily on empty stomach' },
        dosingHigh: { amount: '150', unit: 'mcg', researchBenefits: 'Maximum growth hormone release for advanced injury repair', recommendedFrequency: '3 times daily on empty stomach' },
        sideEffects: 'Slightly increased hunger, temporary water retention, mild lethargy, or numbness in fingers.',
        stackingNotes: 'Typically stacked with CJC-1295 (without DAC) to achieve massive synergistic release of GH. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Efficacy of growth hormone-releasing peptide-2 in short children',
            doi: '10.1210/jcem.83.2.4578',
            pmid: '9467554',
          },
        ],
      },
    },
    {
      name: 'GHRP-6',
      iupacName: 'L-histidyl-D-tryptophyl-L-alanyl-L-tryptophyl-D-phenylalanyl-L-lysinamide',
      synonyms: ['Growth Hormone Releasing Peptide 6'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic growth hormone-releasing hexapeptide GHS-R1a agonist. It stimulates GH secretion via pituitary and hypothalamic pathways, and strongly activates Neuropeptide Y (NPY) neurons in the arcuate nucleus, inducing powerful appetite stimulation and fat-free mass deposition.

### The Analogy (The Layman Explanation)
GHRP-6 is like a master switch for hunger and growth. While other growth hormone secretagogues promote healing with mild hunger, GHRP-6 triggers an intense urge to eat within minutes. This makes it a perfect tool for individuals needing to gain mass, recover from wasting, or stimulate rapid healing.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate, powerful appetite stimulation within 20 minutes; improved sleep quality.
* **Week 2 (Days 8–14)**: Increased muscle volume; faster recovery from exhausting physical workloads.
* **Week 4 (Days 15–28)**: Substantial weight gain (in combination with caloric surplus); joint pain relief.
* **Week 8 (Days 29–56)**: Enhanced muscle recovery and bone density; accelerated injury repair.
* **Week 12 (Days 57–84)**: Peak anabolic mass and strength gains; cycle ends to allow receptor reset.`,
      administrationRoutes: ['SubQ'],
      tags: ['growth-hormone', 'appetite', 'recovery'],
      profile: {
        dosingLow: { amount: '50', unit: 'mcg', researchBenefits: 'Moderate growth hormone increase and mild appetite boost', recommendedFrequency: '1-2 times daily on empty stomach' },
        dosingTypical: { amount: '100', unit: 'mcg', researchBenefits: 'Optimal GH release pulses, deep recovery, and strong hunger stimulus', recommendedFrequency: '2-3 times daily on empty stomach' },
        dosingHigh: { amount: '150', unit: 'mcg', researchBenefits: 'Maximum metabolic and appetite stimulation for mass gain protocols', recommendedFrequency: '2-3 times daily on empty stomach' },
        sideEffects: 'Extreme hunger/cravings, transient lethargy immediately after use, temporary water retention, or mild joint stiffness.',
        stackingNotes: 'Should be taken on a completely empty stomach (minimum 2 hours fast) to prevent blunt of GH pulse by carbohydrates/fats. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Growth hormone-releasing peptide (GHRP-6) action on hypothalamic neurons',
            doi: '10.1046/j.1432-1327.2000.01502.x',
            pmid: '10747190',
          },
        ],
      },
    },
    {
      name: 'Ipamorelin',
      iupacName: '2-methylalanyl-L-histidyl-3-(naphthalen-2-yl)-D-alanyl-D-phenylalanyl-L-lysinamide',
      synonyms: ['NNC 26-0161'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A highly selective growth hormone secretagogue receptor (GHS-R1a) agonist. It mimics native ghrelin by binding to the GHS-R1a receptor on the pituitary and hypothalamus, triggering a pulsatile release of Growth Hormone (GH) via a calcium-dependent pathway. Unlike other GHRPs, it is extremely selective, showing no affinity for the receptors that stimulate cortisol, prolactin, ACTH, or aldosterone secretion, preserving natural pituitary function and pulsatility.

### The Analogy (The Layman Explanation)
Ipamorelin is like a highly targeted, silent bell ringer for the pituitary gland. It knocks on the door of the hormone production room and asks for a clean burst of growth hormone, but does not ring any other alarms. Other similar agents might accidentally pull the emergency levers for stress hormones (cortisol) or hunger hormones, but Ipamorelin rings only the growth and recovery bell, keeping the body's natural chemistry perfectly calm.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Deepening of slow-wave (REM) sleep; increased morning wakefulness; faster recovery from physical exertion.
* **Week 2 (Days 8–14)**: Noticeable improvements in skin elasticity; initial cellular hydration changes; reduction in mild joint soreness.
* **Week 4 (Days 15–28)**: Upregulation of IGF-1 expression in liver tissue; accelerated muscle recovery; fat burning signals begin to optimize.
* **Week 8 (Days 29–56)**: Visually leaner body composition; gradual reduction in visceral fat; improvements in clean muscle retention and recovery times.
* **Week 12 (Days 57–84)**: Optimization of body composition (significant fat reduction and muscle maintenance); systemic anti-aging and vitality markers peak.`,
      administrationRoutes: ['SubQ'],
      tags: ['growth-hormone', 'recovery', 'fat-loss'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Basal fat oxidation and recovery maintenance', recommendedFrequency: 'Once daily at bedtime' },
        dosingTypical: { amount: '200', unit: 'mcg', researchBenefits: 'Optimal GH pulses, muscle preservation, and anti-aging recovery', recommendedFrequency: '1-2 times daily on empty stomach' },
        dosingHigh: { amount: '300', unit: 'mcg', researchBenefits: 'Advanced recovery support for bodybuilders and heavy athletes', recommendedFrequency: '2 times daily on empty stomach' },
        sideEffects: 'Mild, temporary head rush immediately after injection, slight water retention, or local site redness.',
        stackingNotes: 'Often combined with CJC-1295 for a synergistic growth hormone release that mirrors natural physiological secretion. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Ipamorelin, the first selective growth hormone secretagogue',
            doi: '10.1080/09208390701416390',
            pmid: '9865611',
          },
        ],
      },
    },
    {
      name: 'Cagrilintide',
      iupacName: 'AM833',
      synonyms: ['Lipidated amylin analog', 'Amylin agonist'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A long-acting, lipidated, non-selective amylin receptor agonist (GPCR complex of calcitonin receptor CTR with receptor activity-modifying proteins RAMP1-3). It mimics native amylin, a peptide co-secreted with insulin by pancreatic beta-cells. It binds to amylin receptors in the area postrema of the hindbrain, acting synergistically with GLP-1 agonists to slow gastric emptying, suppress glucagon secretion, and induce persistent satiety via pathways distinct from GLP-1.

### The Analogy (The Layman Explanation)
If GLP-1 (like Semaglutide) acts as the volume control knob for hunger, Cagrilintide is a second, independent control knob. Amylin is the hormone the body releases naturally when food lands in the stomach to say "stop eating." By mimicking amylin, Cagrilintide works directly on the brain's sensory centers to make you feel satisfied after just a few bites, while preventing the stomach from emptying too quickly, working hand-in-hand with GLP-1 for maximum metabolic control.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid, powerful onset of satiety; near-total reduction of meal capacity and hunger cues; initial digestion delay begins.
* **Week 2 (Days 8–14)**: Early weight loss of 2-3% of baseline; stabilization of insulin demand and postprandial glucose swings.
* **Week 4 (Days 15–28)**: Synergistic fat oxidation when combined with a GLP-1 agonist; sustained weight reduction averaging 4-6%; strong compliance with calorie deficit.
* **Week 8 (Days 29–56)**: Weight reduction of 8-10% in combination therapies; visible decrease in subcutaneous and visceral fat depots.
* **Week 12 (Days 57–84)**: Average weight loss exceeding 12-14%; stabilization of metabolic rate; body composition adjustments reach therapeutic maintenance levels.`,
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.3', unit: 'mg', researchBenefits: 'Adaptation dose, mild hunger suppression and delayed digestion', recommendedFrequency: 'Once weekly' },
        dosingTypical: { amount: '1.2', unit: 'mg', researchBenefits: 'Substantial appetite suppression and body composition optimization', recommendedFrequency: 'Once weekly' },
        dosingHigh: { amount: '2.4', unit: 'mg', researchBenefits: 'Maximum weight management dose', recommendedFrequency: 'Once weekly' },
        sideEffects: 'Nausea, vomiting, delayed stomach emptying, diarrhea, or mild constipation.',
        stackingNotes: 'Most commonly stacked with Semaglutide (co-formulated as CagriSema) to maximize weight loss outcomes. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Cagrilintide, a dual amylin agonist, for weight management',
            doi: '10.1016/S0140-6736(21)01751-7',
            pmid: '34751433',
          },
        ],
      },
    },
    {
      name: 'GLOW70',
      iupacName: 'Blend of GHK-Cu, Argireline, and SNAP-8',
      synonyms: ['GLOW-70 Cosmetic Blend'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A cosmetic blend combining GHK-Cu, Argireline, and SNAP-8. Argireline and SNAP-8 act synergistically to disrupt the SNARE complex at the neuromuscular junction, relaxing expression muscles, while GHK-Cu delivers essential copper to fibroblasts to synthesize new collagen.

### The Analogy (The Layman Explanation)
GLOW70 is the ultimate skin restoration formula. It uses a double-dampening approach (Argireline and SNAP-8) to relax the dynamic muscles that cause forehead and eye wrinkles. Simultaneously, it sends in copper peptide (GHK-Cu) to rebuild the skin's foundation, creating a smooth, youthful canvas.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Softening of facial micro-tensions; skin looks highly hydrated and radiant.
* **Week 2 (Days 8–14)**: Dynamic expression lines around eyes and brow smooth out significantly.
* **Week 4 (Days 15–28)**: Visibly reduced wrinkle depth; improved skin thickness and elasticity.
* **Week 8 (Days 29–56)**: Structural skin density increases; improvement in tone, color, and pigmentation.
* **Week 12 (Days 57–84)**: Peak anti-aging results; skin barrier is structurally rejuvenated and smooth.`,
      administrationRoutes: ['Topical', 'SubQ'],
      tags: ['cosmetic', 'skin'],
      profile: {
        dosingLow: { amount: '1', unit: 'mg', researchBenefits: 'Skin hydration and cosmetic maintenance', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '2', unit: 'mg', researchBenefits: 'Wrinkle reduction, collagen synthesis, and improved elasticity', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '4', unit: 'mg', researchBenefits: 'Deep expression line remediation and skin rejuvenation', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild skin peeling or redness (if topical), temporary stinging at application site.',
        stackingNotes: 'Keep in amber glass when reconstituted to avoid light-induced peptide degradation. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable refrigerated (2-8°C) for up to 6 months due to sensitive blends.',
        reconstitutedShelfLifeDays: 30,
        fridgeShelfLifeMonths: 6,
        freezerShelfLifeMonths: 12,
        citations: [
          {
            title: 'Advanced topical blends for skin rejuvenation and SNARE complex modulation',
            doi: '10.1111/jocd.15243',
            pmid: '35698544',
          },
        ],
      },
    },
    {
      name: 'CJC-1295 No DAC',
      iupacName: 'L-tyrosyl-D-alanyl-L-α-aspartyl-L-alanyl-L-isoleucyl-L-phenylalanyl-L-threonyl-L-glutaminyl-L-seryl-L-tyrosyl-L-arginyl-L-lysyl-L-valyl-L-leucyl-L-alanyl-L-glutaminyl-L-leucyl-L-seryl-L-alanyl-L-arginyl-L-lysyl-L-leucyl-L-leucyl-L-glutaminyl-L-α-aspartyl-L-isoleucyl-L-leucyl-L-seryl-L-argininamide',
      synonyms: ['Modified GRF 1-29', 'Mod GRF 1-29', 'Sermorelin Tetrasubstituted', 'ModGRF'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synthetic, 29-amino acid analog of Growth Hormone-Releasing Hormone (GHRH) modified at positions 2, 8, 15, and 27 (specifically [D-Ala2, Gln8, Ala15, Leu27]-GHRH(1-29)) to resist rapid enzymatic cleavage by dipeptidyl peptidase-4 (DPP-4). By binding selectively to GHRH receptors on pituitary somatotropes, it stimulates the adenylate cyclase/cAMP/PKA pathway. This leads to increased intracellular calcium concentration, promoting the transcription, translation, and pulsatile secretion of endogenous growth hormone (GH) without causing rapid receptor down-regulation or desensitization.

### The Analogy (The Layman Explanation)
CJC-1295 No DAC is a highly durable key that fits directly into your body's natural growth hormone engine. Unlike natural growth hormone keys that are immediately destroyed by protective enzymes after one use, this modified key is reinforced to withstand those enzymes. This allows it to gently turn the engine on and off, stimulating natural, healthy, wave-like releases of growth hormone to support cellular recovery and metabolism without overwhelming your system.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Pituitary receptor activation begins, initiating pulsatile growth hormone release; noticeable improvement in deep slow-wave sleep quality and overnight physical recovery.
* **Week 2 (Days 8–14)**: Elevated hepatic IGF-1 (insulin-like growth factor 1) secretion, leading to accelerated cellular regeneration, reduced morning joint stiffness, and improved daily energy.
* **Week 4 (Days 15–28)**: Enhanced muscle preservation signaling, early visceral fat mobilization (lipolysis), and noticeable improvements in skin elasticity and moisture retention.
* **Week 8 (Days 29–56)**: Visible changes in body composition (fat loss/muscle preservation), enhanced muscle fullness, and improved joint flexibility and comfort due to extracellular matrix repair.
* **Week 12 (Days 57–84)**: Peak body composition remodeling, optimized somatotropic axis balance, sustained metabolic efficiency, and maximum tissue repair.`,
      administrationRoutes: ['SubQ'],
      tags: ['muscle-building', 'recovery', 'fat-loss'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild recovery, sleep enhancement, and metabolic support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '150', unit: 'mcg', researchBenefits: 'Accelerated tissue repair, lean muscle preservation, and fat loss synergy', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '200', unit: 'mcg', researchBenefits: 'Maximum growth hormone release stimulation and recovery speed', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Transient facial flushing, mild headache, injection-site irritation, or slight water retention.',
        stackingNotes: 'Typically stacked with a growth hormone secretagogue (like Ipamorelin) for maximum synergistic release of GH. Must be administered in a fasted state (at least 2 hours post-meal) to avoid blunting the growth hormone pulse. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Pulsatile Secretion of Growth Hormone (GH) Persists during Continuous Stimulation by CJC-1295, a Long-Acting GH-Releasing Hormone Analog',
            doi: '10.1210/jc.2006-1702',
            pmid: '17018654',
          },
          {
            title: 'Human growth hormone-releasing factor (hGRF)1-29-albumin bioconjugates activate the GRF receptor on the anterior pituitary in rats: identification of CJC-1295 as a long-lasting GRF analog',
            doi: '10.1210/en.2004-1286',
            pmid: '15817669',
          },
        ],
      },
    },
    {
      name: 'CJC-1295 No DAC / Ipamorelin',
      iupacName: 'Blend of CJC-1295 No DAC and Ipamorelin',
      synonyms: ['cjc-1295 no dac / ipamorelin mix', 'cjc/ipamorelin', 'cjc 1295 ipamorelin mix', 'modified grf 1-29 / ipamorelin stack', 'ghrh/ghrp combo'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synergistic combination of a Growth Hormone-Releasing Hormone (GHRH) receptor agonist (CJC-1295 No DAC, a modified GRF 1-29) and a Growth Hormone Secretagogue Receptor (GHS-R1a) agonist (Ipamorelin). 

Taken individually, each peptide works through a separate pathway: CJC-1295 binds to the GHRH receptor, initiating adenylate cyclase/cAMP-dependent transcription and preparing growth hormone (GH) somatotrophic vesicles for release (*priming*). Ipamorelin acts as a ghrelin mimetic, binding to GHS-R1a to activate phospholipase C, mobilizing intracellular calcium ions to trigger the exocytosis of those prepared GH vesicles (*triggering*). 

When combined, they bypass natural regulatory feedback mechanisms: CJC-1295 increases pituitary sensitivity and synthesizes GH stores, while Ipamorelin suppresses somatostatin (a growth hormone inhibitor) and triggers calcium-influx-mediated exocytosis. This dual-pathway "priming and triggering" synergy generates a pulsatile growth hormone surge that is multiple times greater than the sum of their independent effects.

### The Analogy (The Layman Explanation)
Think of your pituitary gland as a biological water tower. CJC-1295 No DAC acts as the high-capacity pump that fills the tower with water (priming the pituitary with newly synthesized growth hormone). Ipamorelin is the release valve handle that opens the floodgates to release the water (triggering the growth hormone pulse). If you use the pump without opening the valve, or open the valve without pumping first, you get a minimal, inefficient trickle. By using them together, the tower is fully filled and the gates are wide open, producing a powerful, clean, natural wave of growth hormone release for cellular recovery.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Immediate dual-pathway activation and pituitary receptor priming; deep slow-wave sleep cycles lengthen significantly, yielding improved morning energy and rapid reduction in workout-induced fatigue.
* **Week 2 (Days 8–14)**: Elevated systemic growth hormone and hepatic IGF-1 levels; enhanced cellular regeneration starts clearing baseline joint and muscle soreness.
* **Week 4 (Days 15–28)**: Synergistic activation of lipolysis (fat breakdown), starting the mobilization of stubborn visceral abdominal fat; lean muscle mass is shielded from breakdown; skin looks hydrated and firm.
* **Week 8 (Days 29–56)**: Visible improvements in body composition (reduced waist measurements, improved muscle definition); connective tissues strengthen; joint movement becomes smoother.
* **Week 12 (Days 57–84)**: Peak physical remodeling (optimal fat loss and muscle retention ratio); natural somatotropic axis balance is sustained; maximum metabolic efficiency and cell renewal are established.`,
      administrationRoutes: ['SubQ'],
      tags: ['muscle-building', 'recovery', 'fat-loss'],
      profile: {
        dosingLow: { amount: '100/100', unit: 'mcg', researchBenefits: 'Mild sleep optimization, subtle recovery increase, and general metabolic support', recommendedFrequency: 'Once daily (before bed)' },
        dosingTypical: { amount: '100/100', unit: 'mcg', researchBenefits: 'Standard fat loss support, muscle preservation, and enhanced workout recovery', recommendedFrequency: 'Twice daily (morning and before bed)' },
        dosingHigh: { amount: '150/150', unit: 'mcg', researchBenefits: 'Advanced body composition remodeling and accelerated injury rehabilitation', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Transient facial flushing, mild headache, injection-site redness, or slight water retention. Notably free from the cortisol and prolactin spikes associated with older secretagogues.',
        stackingNotes: 'Administered subcutaneously on an empty stomach. Must be fasted for at least 2 hours prior and 30 minutes post-injection to prevent dietary insulin from blunting the growth hormone release pulse. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Pulsatile Secretion of Growth Hormone (GH) Persists during Continuous Stimulation by CJC-1295, a Long-Acting GH-Releasing Hormone Analog',
            doi: '10.1210/jc.2006-1702',
            pmid: '17018654',
          },
          {
            title: 'Ipamorelin, the first selective growth hormone secretagogue',
            doi: '10.1530/eje.0.1390552',
            pmid: '9849822',
          },
          {
            title: 'Pharmacokinetic-pharmacodynamic modeling of ipamorelin, a growth hormone releasing peptide, in human volunteers',
            doi: '10.1023/A:1018955126402',
            pmid: '10496658',
          },
        ],
      },
    },
    {
      name: 'BPC-157 / TB-500',
      iupacName: 'Blend of BPC-157 and TB-500',
      synonyms: ['bpc-157 / tb-500 mix', 'bpc157/tb500 mix', 'bpc 157 tb 500 stack', 'wolverine stack', 'healing combo'],
      mechanismOfAction:
        `### The Technical Mechanism (The Science)
A synergistic combination of Body Protection Compound-157 (BPC-157) and Thymosin Beta-4 (TB-500). 

BPC-157 functions as a localized healing accelerator by upregulating Vascular Endothelial Growth Factor receptor 2 (VEGFR2) expression, promoting rapid site-specific angiogenesis (new blood vessel formation) to restore perfusion and nutrient delivery. It also stimulates the FAK-paxillin pathway, triggering local fibroblast migration and collagen type I synthesis to construct structural tissue scaffolding at the injury site. 

TB-500 acts systemically as a major G-actin monomer-sequestering peptide, preventing actin polymerization to maintain cell membrane fluidity and structural mobility. This facilitates the rapid migration of fibroblasts, keratinocytes, and endothelial cells over long distances to the injury site. It also upregulates matrix metalloproteinases (MMPs) to degrade and clear damaged extracellular matrix debris, while suppressing pro-inflammatory cytokines (TNF-alpha, IL-1beta). 

Combined, BPC-157 builds the localized structural pathways (angiogenesis and collagen) while TB-500 clears the cellular debris and provides the actin-mediated cell mobility, producing a powerful localized and systemic tag-team response that dramatically accelerates musculoskeletal recovery.

### The Analogy (The Layman Explanation)
Think of an injury as a collapsed bridge in a remote town. BPC-157 acts as the local construction foreman who sets up the site, builds new access roads (blood vessels), and orders the raw concrete (collagen). TB-500 acts as the logistics coordinator who clears the wreckage and rubble off the roads (MMPs clearing debris) and provides high-speed transit vehicles (actin-driven cell mobility) so that repair workers can easily travel from all over the body. If you only have access roads but no vehicles (only BPC-157), rebuilding is slow. If you have vehicles but no roads or concrete (only TB-500), workers cannot reach the bridge. Together, they rebuild the bridge in record time.

### Clinical Expected Timeline
* **Week 1 (Days 1–7)**: Rapid suppression of localized swelling and inflammatory signaling; early reduction in acute joint, tendon, and muscle stiffness; early gastric mucosal lining stabilization.
* **Week 2 (Days 8–14)**: Upregulated cell migration and capillary sprout formation (angiogenesis); significantly accelerated post-workout muscle recovery and reduced post-exercise soreness.
* **Week 4 (Days 15–28)**: Substantial deposition of organized collagen type I fibers and fibroblast migration; noticeable improvement in flexibility, range of motion, and ligament load-bearing capacity.
* **Week 8 (Days 29–56)**: Mechanical strength of repaired ligaments, tendons, and muscle fibers increases dramatically; old or chronic scar tissue begins remodeling into flexible, healthy tissue.
* **Week 12 (Days 57–84)**: Peak biomechanical restoration of injured structures; complete recovery of range of motion and tissue resiliency; joints, muscles, and tendons return to baseline strength.`,
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '250/2.0', unit: 'mcg/mg', researchBenefits: 'Mild recovery support, systemic inflammation management, and joint maintenance', recommendedFrequency: 'BPC-157 daily, TB-500 twice weekly' },
        dosingTypical: { amount: '500/5.0', unit: 'mcg/mg', researchBenefits: 'Standard tendon, ligament, muscle, and joint healing protocol', recommendedFrequency: 'BPC-157 daily, TB-500 twice weekly' },
        dosingHigh: { amount: '1000/10.0', unit: 'mcg/mg', researchBenefits: 'Accelerated loading protocol for severe or acute muscle and ligament tears', recommendedFrequency: 'BPC-157 twice daily, TB-500 twice weekly' },
        sideEffects: 'Temporary injection-site redness, mild headache, transient fatigue, or slight nausea at high loading doses.',
        stackingNotes: 'Administered via subcutaneous or intramuscular injection near the injury site (for BPC-157 localized effect) or systemically. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        citations: [
          {
            title: 'Stable Gastric Pentadecapeptide BPC 157 and Wound Healing',
            doi: '10.3389/fphar.2021.627533',
            pmid: '34267654',
          },
          {
            title: 'Thymosin beta-4: a multi-functional regenerative peptide. Basic properties and clinical applications',
            doi: '10.1517/14712598.2012.634793',
            pmid: '22074294',
          },
          {
            title: 'Thymosin beta-4 accelerates wound healing',
            doi: '10.1096/fj.09-140046',
            pmid: '20103959',
          },
        ],
      },
    },
  ];

  const fixturesPath = path.join(__dirname, 'seed-data/dosing_fixtures.json');
  let fixtures: any[] = [];
  try {
    const raw = fs.readFileSync(fixturesPath, 'utf-8');
    fixtures = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load dosing fixtures:', err);
  }

  const pairingFixturesPath = path.join(__dirname, 'seed-data/compound_pairings.json');
  let pairingFixtures: SeedPairing[] = [];
  try {
    const raw = fs.readFileSync(pairingFixturesPath, 'utf-8');
    pairingFixtures = JSON.parse(raw) as SeedPairing[];
  } catch (err) {
    console.error('Failed to load compound pairing fixtures:', err);
  }

  const adjunctFixturesPath = path.join(__dirname, 'seed-data/compound_adjuncts.json');
  let adjunctFixtures: SeedAdjunctRecommendation[] = [];
  try {
    const raw = fs.readFileSync(adjunctFixturesPath, 'utf-8');
    adjunctFixtures = JSON.parse(raw) as SeedAdjunctRecommendation[];
  } catch (err) {
    console.error('Failed to load compound adjunct fixtures:', err);
  }

  for (const { profile, ...compoundData } of compounds) {
    const dataWithSlug = {
      ...compoundData,
      slug: nameToSlug(compoundData.name),
      catalogKey: nameToSlug(compoundData.name),
      // Store synonyms lowercase so case-insensitive synonym search works
      // (Prisma 'has' on string arrays is case-sensitive).
      synonyms: compoundData.synonyms.map((s) => s.toLowerCase()),
    };
    const compound = await prisma.catalogItem.upsert({
      where: { name: compoundData.name },
      update: dataWithSlug,
      create: dataWithSlug,
    });

    if (profile) {
      const fixture = fixtures.find((f: any) => f.name === compound.name || f.name.toLowerCase() === compound.name.toLowerCase());
      const { citations: rawSeedCitations, ...profileData } = profile;

      let mergedProfile = { ...profileData };
      let citationsToUse: SeedCitationRef[] = rawSeedCitations as SeedCitationRef[];

      if (fixture && fixture.profile) {
        mergedProfile = {
          ...mergedProfile,
          ...fixture.profile,
        };
        if (fixture.citations && fixture.citations.length > 0) {
          citationsToUse = fixture.citations as SeedCitationRef[];
        }
      }

      const timeline = getBenefitTimelineForSeed(compound.name, compound.tags, compound.mechanismOfAction);
      const summary = getExpectedBenefitsSummaryForSeed(compound.name, compound.tags, compound.mechanismOfAction);
      const dataWithTimeline = {
        ...mergedProfile,
        benefitTimeline: timeline,
        expectedBenefitsSummary: summary,
      };
      const upsertedProfile = await prisma.compoundProfile.upsert({
        where: { catalogItemId: compound.id },
        update: dataWithTimeline,
        create: { catalogItemId: compound.id, ...dataWithTimeline },
      });

      // Perform differential sync for citations to preserve unchanged entries and avoid blanket deletes.
      const existingCitations = await prisma.citation.findMany({
        where: { catalogItemId: compound.id },
      });

      const citationsToDelete = existingCitations.filter((existing) => {
        return !citationsToUse.some(
          (incoming) =>
            incoming.title === existing.title &&
            (incoming.url ?? null) === existing.url &&
            (incoming.doi ?? null) === existing.doi &&
            (incoming.pmid ?? null) === existing.pmid
        );
      });

      if (citationsToDelete.length > 0) {
        await prisma.citation.deleteMany({
          where: {
            id: { in: citationsToDelete.map((c) => c.id) },
          },
        });
      }

      const citationsToCreate = citationsToUse.filter((incoming) => {
        return !existingCitations.some(
          (existing) =>
            incoming.title === existing.title &&
            (incoming.url ?? null) === existing.url &&
            (incoming.doi ?? null) === existing.doi &&
            (incoming.pmid ?? null) === existing.pmid
        );
      });

      for (const citation of citationsToCreate) {
        await prisma.citation.create({
          data: {
            catalogItemId: compound.id,
            title: citation.title,
            url: citation.url ?? null,
            doi: citation.doi ?? null,
            pmid: citation.pmid ?? null,
          },
        });
      }
    }
  }

  await syncCompoundPairings(pairingFixtures);
  await syncCompoundAdjunctRecommendations(adjunctFixtures);

  // 1. Create default Power User
  const email = 'test@example.com';
  const password = 'Password123!';
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const testUser = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      name: 'Test Power User',
      passwordHash,
      role: 'POWER_USER',
      status: 'ACTIVE',
    },
  });

  // 2. Fetch seeded compounds
  const bpc = await prisma.catalogItem.findFirst({ where: { name: 'BPC-157' } });
  const tb500 = await prisma.catalogItem.findFirst({ where: { name: 'TB-500' } });
  const tirz = await prisma.catalogItem.findFirst({ where: { name: 'Tirzepatide' } });

  if (bpc && tb500 && tirz) {
    // 3. Upsert Vendor
    const vendor = await prisma.vendor.upsert({
      where: {
        id: '00000000-0000-0000-0000-000000000009',
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000009',
        userId: testUser.id,
        name: 'Peptide Depot',
        telegramUsername: 'peptidedepot_bot',
        preferredCurrency: 'USD',
        status: 'ACTIVE',
      },
    });

    // 4. Upsert VendorProducts
    const products = [
      {
        id: '00000000-0000-0000-0000-000000000091',
        vendorId: vendor.id,
        compoundId: bpc.id,
        name: 'BPC-157 5mg vial',
        priceUsd: '35.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '5.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000092',
        vendorId: vendor.id,
        compoundId: bpc.id,
        name: '10x BPC-157 10mg (10-pack)',
        priceUsd: '250.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '10.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000093',
        vendorId: vendor.id,
        compoundId: tb500.id,
        name: 'TB-500 5mg vial',
        priceUsd: '45.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '5.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000094',
        vendorId: vendor.id,
        compoundId: tirz.id,
        name: 'Tirzepatide 10mg vial',
        priceUsd: '80.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '10.0',
      },
    ];

    for (const p of products) {
      await prisma.vendorProduct.upsert({
        where: { id: p.id },
        update: p,
        create: p,
      });
    }

    // 5. Upsert active/reconstituted Vials
    // To calculate depletion correctly, let's create a vial of BPC-157 with low remaining Mg
    await prisma.vial.upsert({
      where: { id: '00000000-0000-0000-0000-000000000081' },
      update: {
        remainingMg: 1.2,
      },
      create: {
        id: '00000000-0000-0000-0000-000000000081',
        userId: testUser.id,
        compoundId: bpc.id,
        totalMg: 5.0,
        remainingMg: 1.2,
        bacWaterMl: 2.0,
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 3600 * 1000),
      },
    });

    // TB-500 reconstituted vial
    await prisma.vial.upsert({
      where: { id: '00000000-0000-0000-0000-000000000082' },
      update: {
        remainingMg: 8.5,
      },
      create: {
        id: '00000000-0000-0000-0000-000000000082',
        userId: testUser.id,
        compoundId: tb500.id,
        totalMg: 10.0,
        remainingMg: 8.5,
        bacWaterMl: 2.0,
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 28 * 24 * 3600 * 1000),
      },
    });

    // 6. Upsert active Protocols
    // BPC-157 Protocol: 250 mcg daily (depletes 0.25 mg per day)
    await prisma.protocol.upsert({
      where: { id: '00000000-0000-0000-0000-000000000071' },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000071',
        userId: testUser.id,
        compoundId: bpc.id,
        dose: { amount: '250', unit: 'mcg' } as any,
        schedule: { frequency: 'Daily' } as any,
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      },
    });

    // TB-500 Protocol: 2.5 mg EOD (depletes 1.25 mg per day on average)
    await prisma.protocol.upsert({
      where: { id: '00000000-0000-0000-0000-000000000072' },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000072',
        userId: testUser.id,
        compoundId: tb500.id,
        dose: { amount: '2.5', unit: 'mg' } as any,
        schedule: { frequency: 'EOD' } as any,
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      },
    });
  }

  console.log(`Seed complete — ${compounds.length} compounds and 1 test user seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

function getBenefitTimelineForSeed(name: string, tags: string[], moa: string | null) {
  const normName = name.toLowerCase();

  if (normName.includes('testosterone')) {
    return [
      {
        week: 1,
        benefits: [
          'Replacement Onset: Serum testosterone begins moving toward the prescribed replacement range; symptom response should not be judged from the first few doses alone',
          'Early Tolerability Check: Watch for injection-site irritation, acne/oily skin, edema, blood-pressure increases, and worsening sleep-apnea symptoms',
          'Monitoring Baseline: Confirm the plan for follow-up testosterone concentration, hematocrit/hemoglobin, blood pressure, and prostate-risk monitoring when age/risk appropriate'
        ]
      },
      {
        week: 2,
        benefits: [
          'Peak/Trough Smoothing: Weekly or twice-weekly injection schedules may reduce swings compared with larger injections every 2-4 weeks',
          'Sexual-Symptom Signal: Libido or morning-erection changes may begin in responders, while energy, cognition, and mood changes are less predictable',
          'Fluid and Skin Effects: Estradiol/DHT-mediated effects such as breast tenderness, acne, hair shedding, or water retention can start emerging'
        ]
      },
      {
        week: 4,
        benefits: [
          'Therapeutic Response Window: Many TRT effects begin around 3-6 weeks, with sexual-function changes generally better supported than nonspecific vitality claims',
          'Dose-Adjustment Context: Do not chase supraphysiologic levels; titration should use symptoms, adverse effects, and correctly timed testosterone labs',
          'Fertility Suppression: LH/FSH suppression is expected and can reduce intratesticular testosterone and sperm production'
        ]
      },
      {
        week: 8,
        benefits: [
          'Body-Composition Trend: Lean-mass and strength changes are gradual and depend heavily on training, nutrition, sleep, and staying in physiologic ranges',
          'Erythropoiesis Signal: Hematocrit and hemoglobin can rise; erythrocytosis risk increases with higher exposure and injectable peaks',
          'Risk Review: Reassess blood pressure, edema, sleep apnea, urinary symptoms, mood changes, gynecomastia, and thromboembolic warning symptoms'
        ]
      },
      {
        week: 12,
        benefits: [
          'Formal Follow-Up Window: Typical monitoring reassesses symptoms, adverse effects, testosterone concentration, hematocrit, blood pressure, and PSA/prostate-risk context when indicated',
          'Dose Optimization: Aim for mid-normal physiologic serum testosterone rather than maximum tolerated dosing',
          'Longer-Term Outcomes: Bone-density and durable body-composition endpoints require months to years, not a short 12-week performance-cycle interpretation'
        ]
      }
    ];
  }
  if (normName.includes('ara-290') || normName.includes('ara290')) {
    return [
      {
        week: 1,
        benefits: [
          'Nerve Repair Activation: Triggers the body\'s natural "repair switch" on damaged nerves to silence cells that are sending urgent, burning pain signals',
          'Calming Burning & Tingling: Provides early relief from acute neuropathic discomfort, such as burning, tingling, or electric-shock sensations in the hands and feet',
          'Reducing Neuroinflammation: Begins lowering the inflammatory chemicals that keep nerve endings irritated and hypersensitive'
        ]
      },
      {
        week: 2,
        benefits: [
          'Pain Score Reduction: Decreases the intensity of daily nerve pain, making it easier to fall asleep and move around comfortably',
          'Blood Vessel Protection: Strengthens the tiny blood vessels that feed oxygen and nutrients to nerve endings, preventing further nerve damage',
          'Fatigue Relief: Helps lower the deep, chronic physical exhaustion that often accompanies persistent nerve pain'
        ]
      },
      {
        week: 4,
        benefits: [
          'Stabilizing Nerve Wiring: Protects and stabilizes the delicate microscopic wiring (axons) of your nerves, preventing them from breaking down further',
          'Temperature Sensitivity Support: Improves the body\'s ability to correctly feel temperature changes, helping hands and feet better sense warm and cold',
          'Nerve Cell Preservation: Activates protective cellular survival paths to keep struggling nerve cells alive and functional'
        ]
      },
      {
        week: 8,
        benefits: [
          'Small Nerve Regrowth: Stimulates the actual regrowth and branching of tiny nerve fibers that have withered due to injury or illness',
          'Restoring Touch Sensitivity: Decreases numbness in the hands and feet, helping you feel surfaces and textures more naturally',
          'Better Daily Mobility: Restores confidence in standing and walking by relieving the pain triggered by foot-to-ground contact'
        ]
      },
      {
        week: 12,
        benefits: [
          'Peak Neuropathic Relief: Reaches maximum pain reduction, bringing long-term stability to nerve signaling and a return to daily comfort',
          'Calming Touch Hypersensitivity: Relieves hypersensitivity where even a light touch, clothing, or bedsheets feel uncomfortable or painful',
          'Nervous System Peace: Optimizes sleep, focus, and energy by permanently lowering systemic inflammatory stress on the nervous system'
        ]
      }
    ];
  }
  if (normName.includes('kpv')) {
    return [
      {
        week: 1,
        benefits: [
          'Mast Cell Stabilization: Calms hyperactive immune cells (mast cells) to prevent the sudden release of histamine, reducing allergic flare-ups, skin itching, and hives',
          'Histamine Regulation: Lowers overall histamine responses, helping to soothe allergy symptoms and food sensitivities',
          'Gut Spasm Relief: Relaxes the smooth muscles of the digestive tract to cool down painful stomach cramps and intestinal spasms'
        ]
      },
      {
        week: 2,
        benefits: [
          'Soothing Gut Inflammation: Shuts down the genetic signals (NF-kB pathway) that drive chronic inflammation, cooling digestive irritation',
          'Bloating and Gas Reduction: Lowers swelling in the gut wall, leading to a flatter stomach and significant relief from post-meal bloating',
          'Skin Barrier Calming: Relieves the redness, itching, and scaling associated with inflammatory skin issues like eczema, psoriasis, and dermatitis'
        ]
      },
      {
        week: 4,
        benefits: [
          'Gut Barrier Repair: Rebuilds and tightens the microscopic seals in the gut wall (vital for fixing leaky gut and preventing toxins from entering the bloodstream)',
          'Skin Healing Support: Speeds up the early stages of skin repair, helping cuts, scrapes, or mild burns heal faster',
          'Local Immune Defense: Strengthens the body\'s natural defenses on mucosal linings to help prevent minor infections'
        ]
      },
      {
        week: 8,
        benefits: [
          'Mucosal Lining Healing: Rebuilds and thickens the protective mucosal lining of the stomach and intestines, guarding against irritation and ulcers',
          'Antimicrobial & Anti-Fungal Action: Helps the body control opportunistic yeast and bacterial overgrowths (specifically targeting Candida and Staph)',
          'Better Cosmetic Healing: Promotes the organized growth of new skin cells as wounds heal, helping to prevent thick, visible scars'
        ]
      },
      {
        week: 12,
        benefits: [
          'Gastrointestinal Balance: Achieves stable digestive homeostasis, helping you process foods comfortably without inflammatory bloating or cramps',
          'Systemic Immune Balance: Calms an overactive immune system, providing long-term defense against chronic inflammatory flare-ups in the skin, joints, and organs',
          'Peak Skin Resilience: Strengthens the skin\'s outer barrier, reducing sensitivity to environmental allergens and daily irritants'
        ]
      }
    ];
  }

  if (normName.includes('mots-c') || normName.includes('mots c')) {
    return [
      {
        week: 1,
        benefits: [
          'Immediate Stamina Boost: Increases physical endurance and aerobic exercise capacity, allowing you to sustain higher exertion levels with less effort',
          'Lactic Acid Reduction: Delays the buildup of lactic acid in active muscles, reducing the burning sensation and muscle fatigue during exercise',
          'Mitochondrial Wake-up: Activates existing cellular energy generators to optimize oxygen utilization at the start of your cycle'
        ]
      },
      {
        week: 2,
        benefits: [
          'Metabolic Rate Shift: Signals cells to switch to burning fatty acids and glucose more efficiently, raising overall resting energy expenditure',
          'Improved Insulin Sensitivity: Enhances the uptake of glucose into muscle tissues after meals, promoting stable blood sugar levels',
          'Active Fuel Mobilization: Mobilizes fatty acids from storage, preparing the body to consume fat directly for metabolic heat'
        ]
      },
      {
        week: 4,
        benefits: [
          'Substantial Fat Burning: Accelerates the breakdown of stubborn white adipose tissue, supporting a leaner overall body composition',
          'Lower Metabolic Inflammation: Suppresses the inflammatory signals linked to metabolic dysfunction, promoting systemic vascular health',
          'Healthy Cholesterol Support: Improves lipid transport pathways, helping to lower harmful triglycerides and optimize cholesterol levels'
        ]
      },
      {
        week: 8,
        benefits: [
          'Lean Muscle Preservation: Prevents muscle breakdown during caloric deficits, protecting structural integrity and physical strength',
          'Visceral Fat Clearance: Targets and reduces hazardous deep visceral fat surrounding internal organs',
          'Bone Density Building: Stimulates osteoblasts (bone-forming cells) to lay down new bone matrix, reinforcing skeletal strength'
        ]
      },
      {
        week: 12,
        benefits: [
          'Cellular Energy Flexibility: Fully restores the cells\' ability to switch smoothly between burning fat and carbohydrates based on demand',
          'Complete Metabolic Reset: Establishes a clean, highly efficient homeostatic baseline for daily calorie utilization and energy production',
          'Peak Long-term Vitality: Sustains improved insulin sensitivity, cell survival pathways, and overall physical recovery capacity'
        ]
      }
    ];
  }

  if ((normName.includes('bpc-157') || normName.includes('bpc 157')) && (normName.includes('tb-500') || normName.includes('tb 500'))) {
    return [
      {
        week: 1,
        benefits: [
          'Dual-Pathway Inflammation Cooling: Rapidly cools localized swelling and systemic inflammatory signals, noticeably reducing acute joint, tendon, and muscle stiffness',
          'Immediate Gut Comfort: Comforts and calms the gastrointestinal lining, supporting gut barrier integrity and early digestive relief',
          'Initial Mobility Support: Prepares muscle and soft tissue fibers for cellular motility and repair, easing everyday discomfort'
        ]
      },
      {
        week: 2,
        benefits: [
          'Accelerated Angiogenesis & Motility: Promotes new capillary blood vessel sprouting (angiogenesis) to feed slow-healing tissues, while boosting cell mobility to transport healing factors to injuries',
          'Workout Recovery Acceleration: Speeds up metabolic muscle recovery between exercises, allowing you to bounce back faster from exercise',
          'Gastric Lining Healing: Accelerates the repair of micro-abrasions in the stomach and intestinal tracts'
        ]
      },
      {
        week: 4,
        benefits: [
          'Organized Collagen Deposition: Speeds up the deposition of organized type I collagen and actin-mediated cell migration to rebuild damaged ligaments, tendons, and muscles',
          'Connective Tissue Flexibility: Increases structural elasticity, leading to improved range of motion and joint fluidity',
          'Nervous System Protection: Modulates nitric oxide pathways to support healthy blood flow, while protecting peripheral nerve pathways'
        ]
      },
      {
        week: 8,
        benefits: [
          'Mechanical Load Reinforcement: Strengthens tendon-to-bone junctions and muscle fiber alignment, allowing joints to carry heavier physical loads comfortably',
          'Scar Tissue Remodeling: Modulates tissue remodeling to break down and smooth over stiff, old scar tissue, restoring natural fiber movement',
          'Deep Gut Barrier Seal: Resolves digestive permeability by tightening cellular junctions, maximizing nutrient uptake and calming systemic food sensitivities'
        ]
      },
      {
        week: 12,
        benefits: [
          'Peak Biomechanical Restoration: Reestablishes complete range of motion and tensile strength in previously injured musculoskeletal structures',
          'Musculoskeletal Resilience: Resolves soft tissue recovery cycles, leaving joints, muscles, and tendons structurally sound and fully recovered',
          'Sustained Systemic Vitality: Returns cellular repair cycles and physical performance to a highly resilient baseline, protecting against future strain'
        ]
      }
    ];
  }
  if (normName.includes('bpc-157') || normName.includes('bpc 157')) {
    return [
      {
        week: 1,
        benefits: [
          'Gut Lining Relief: Cools localized inflammation in the stomach and digestive tract to support a healthy gut barrier (helps relieve heartburn, bloating, and indigestion)',
          'Initial Recovery Kickstart: Reduces muscle soreness and joint stiffness after exercise, helping you bounce back faster from physical activity',
          'Internal Tissue Shield: Begins protecting the stomach lining and organ tissues from medication or lifestyle stress (such as pain reliever irritation)'
        ]
      },
      {
        week: 2,
        benefits: [
          'New Blood Vessel Support: Promotes blood vessel growth in injured areas (crucial for bringing oxygen and healing nutrients directly to slow-healing tissues like tendons and ligaments)',
          'Active Tissue Repair: Guides specialized healing cells to migrate to areas of soft tissue damage, laying the groundwork for physical recovery',
          'Organ and Stomach Healing: Accelerates the natural repair of micro-tears in the digestive tract and stomach lining'
        ]
      },
      {
        week: 4,
        benefits: [
          'Collagen Production: Triggers the production of collagen, the body\'s main structural building block, to rebuild damaged muscles, tendons, ligaments, and joints',
          'Brain and Nerve Support: Balances brain chemical messengers (like dopamine and serotonin) to help protect nerve cells and support emotional well-being',
          'Circulation Regulation: Modulates nitric oxide pathways to support healthy blood flow and blood pressure throughout the body'
        ]
      },
      {
        week: 8,
        benefits: [
          'Structural Reinforcement: Bonds and strengthens tissue-to-bone connections (essential for completing recovery from tendon or ligament tears)',
          'Weight and Load Capacity: Restores physical stability to joints, allowing them to bear weight and handle daily physical tasks comfortably',
          'Sealing the Gut Barrier: Restores tight junctions in the digestive system, sealing the gut lining to prevent food particles from leaking and improving nutrient absorption'
        ]
      },
      {
        week: 12,
        benefits: [
          'Flexible Tissue Remodeling: Complete maturation of newly formed fibers, returning injured areas to their normal strength, flexibility, and range of motion',
          'Peak Gastrointestinal Harmony: Re-establishes healthy communication between the gut and brain, promoting optimal digestion and reducing general systemic inflammation',
          'Long-term Joint & Muscle Protection: Stabilizes newly repaired areas to protect against re-injury during workouts or demanding daily labor'
        ]
      }
    ];
  }
  if (normName.includes('tb-500') || normName.includes('tb 500') || normName.includes('thymosin beta')) {
    return [
      {
        week: 1,
        benefits: [
          'Actin Cell Activation: Initiates the biological process that allows cells to travel and repair tissue, easing acute joint and muscle stiffness',
          'Calming Early Swelling: Reduces acute localized swelling and inflammatory signaling at injury sites, promoting early comfort',
          'Vascular Priming: Begins preparing micro-blood vessels to supply damaged fibers with recovery resources'
        ]
      },
      {
        week: 2,
        benefits: [
          'Joint & Muscle Flexibility: Significantly lowers joint stiffness and increases flexibility, improving daily mobility and range of motion',
          'Systemic Inflammation Reduction: Shuts down pro-inflammatory cytokines, calming generalized muscle soreness and body-wide tissue stress',
          'Hair Follicle Support: Wakes up hair follicles by encouraging blood flow to roots, promoting early hair growth cues'
        ]
      },
      {
        week: 4,
        benefits: [
          'Healing Cell Migration: Speeds up cell migration to tears in soft tissues (muscles, tendons, ligaments), accelerating structural healing',
          'New Blood Vessel Growth: Stimulates angiogenesis (new blood vessel formation) to feed recovering tissues with oxygen and nutrients',
          'Cardiovascular Protection: Supports protective cell signals that help preserve heart muscle health under stress'
        ]
      },
      {
        week: 8,
        benefits: [
          'Remodeling Muscle Fibers: Rebuilds and reorganizes structural fibers in injured muscles, restoring their natural load-bearing alignment',
          'Tendinous & Ligament Strength: Accelerates the healing of slow-recovery connective tissues (tendons and ligaments), reinforcing joint stability',
          'Neuroprotective Shielding: Promotes pathways that protect nerve cells from injury and support repair in the central nervous system'
        ]
      },
      {
        week: 12,
        benefits: [
          'Advanced Muscle Recovery: Peak regeneration of newly formed fibers, restoring normal physical strength, speed, and endurance',
          'Peak Joint Flexibility: Reaches maximum improvement in flexibility and joint elasticity, eliminating chronic post-workout stiffness',
          'Injury Protection: Stabilizes newly repaired areas to protect against re-injury during heavy physical training or daily tasks'
        ]
      }
    ];
  }
  if (normName.includes('retatrutide')) {
    return [
      {
        week: 1,
        benefits: [
          'Appetite & Sugar Control: Significantly reduces mental "food noise" and cravings while keeping blood sugar spikes flat after eating',
          'Lowering Systemic Stress: Begins calming key inflammatory chemical pathways in cells, reducing general cellular stress and systemic irritation',
          'Initial Gastric Adjustment: Gently regulates digestion speed to encourage long-term digestive stability'
        ]
      },
      {
        week: 2,
        benefits: [
          'Early Weight & Water Shift: Promotes consistent, slow digestion, helping you drop initial water weight (typically 1–2% of body weight)',
          'Fat Clearing in the Liver: Activates liver receptors to burn stored liver fat directly, helping reverse fatty liver changes and optimize liver function',
          'Fat Oxidation Start: Signals the cell\'s furnaces to burn fat cells directly for energy, elevating daily calorie consumption'
        ]
      },
      {
        week: 4,
        benefits: [
          'Cellular Receptor Saturation: Reaches therapeutic levels on all three target receptors (GLP-1, GIP, glucagon) to trigger full-scale cellular protection',
          'Mitochondrial Energy Boost: Upgrades cellular energy output, supporting physical recovery, metabolic flexibility, and daily stamina',
          'Endothelial Vessel Support: Supports healthy blood vessel lining function, assisting with oxygen and nutrient flow to active tissues'
        ]
      },
      {
        week: 8,
        benefits: [
          'Deep Fat Burn: Promotes rapid breakdown of stubborn visceral and abdominal fat (typically achieving 4–6% total weight reduction)',
          'Bone Density Protection: Stimulates bone-building cells to safeguard bone minerals and maintain skeletal/joint structural integrity as weight drops',
          'Improved Lipid Profile: Enhances lipid transport pathways to help clear blood triglycerides and normalize cholesterol'
        ]
      },
      {
        week: 12,
        benefits: [
          'Deep Metabolic Reset: Resolves insulin resistance and achieves a significant, long-term reduction in average blood sugar (HbA1c)',
          'Peak Anti-Inflammatory Remodeling: Re-establishes a clean, calm physical baseline with a marked drop in systemic inflammation markers (like hsCRP)',
          'Muscle Preservation & Strength: Promotes body composition adjustments that focus on burning fat while preserving lean muscle mass and supporting general strength recovery'
        ]
      }
    ];
  }
  if (normName.includes('semaglutide') || normName.includes('tirzepatide')) {
    return [
      { week: 1, benefits: ['Hypothalamic food noise reduction and suppression of glycemic spikes'] },
      { week: 2, benefits: ['Consistent delay in gastric emptying, initial 1-2% mean body weight reduction (primarily water weight)'] },
      { week: 4, benefits: ['Establishment of basal GLP-1/GIP receptor saturation, initial fat oxidation signals at low dose'] },
      { week: 8, benefits: ['Accelerated adipose tissue lipolysis, average 4-6% total body weight reduction, improved HOMA-IR sensitivity'] },
      { week: 12, benefits: ['Significant HbA1c reduction (averaging 1.5-2.0% in diabetes trials), stabilized metabolic adaptation and consistent satiety'] },
    ];
  }
  if (normName.includes('nad')) {
    return [
      { week: 1, benefits: ['Pharmacokinetic spike in systemic NAD+ coenzyme pools, improved deep slow-wave sleep cues'] },
      { week: 2, benefits: ['Mitochondrial membrane potential stabilization, reduced baseline cellular oxidative stress'] },
      { week: 4, benefits: ['Upregulated cellular ATP production, measurable reduction in physical and mental fatigue scores'] },
      { week: 8, benefits: ['Activation of sirtuin pathways (SIRT1/SIRT3) and PARP-1 DNA repair enzyme transcription'] },
      { week: 12, benefits: ['Enhanced mitochondrial DNA copy number, peak metabolic efficiency, and reduced systemic cytokines (IL-6, TNF-alpha)'] },
    ];
  }
  if (normName.includes('oxytocin')) {
    return [
      {
        week: 1,
        benefits: [
          'Immediate Stress Relief: Quiets down the brain\'s threat-detection system, bringing a rapid drop in daily stress and social anxiety',
          'Enhanced Social Ease: Boosts early feelings of security and relaxation during social interactions, making it easier to connect with others',
          'Soothing Tissue Inflammation: Initiates early anti-inflammatory actions to quiet down localized tissue stress'
        ]
      },
      {
        week: 2,
        benefits: [
          'Empathy & Cue Connection: Calms brain hyperactivity to improve your ability to read social cues and understand others\' feelings',
          'Mood Support: Promotes the natural release of dopamine and serotonin, supporting feelings of emotional warmth and contentment',
          'Vascular Protection: Supports healthy blood vessel relaxation and circulation, promoting cardiovascular calmness'
        ]
      },
      {
        week: 4,
        benefits: [
          'Deepening Connections: Strengthens pathways for bonding, building authentic trust, and deepening personal and professional relationships',
          'Cortisol Control: Lowers the production of cortisol (the main stress hormone), shielding cells from the physical wear-and-tear of chronic worry',
          'Accelerated Skin Repair: Promotes cell migration and tissue repair, helping skin blemishes, scrapes, or cuts heal more cleanly'
        ]
      },
      {
        week: 8,
        benefits: [
          'Balanced Emotional Response: Regulates the body\'s stress-response axis, helping you maintain a calm, balanced perspective when handling stressful events',
          'Cardioprotective Support: Aids in protecting heart muscle tissues and regulating arterial health through nitric oxide pathway support',
          'Bone Density Protection: Stimulates pathways that support bone-remodeling cells, maintaining skeletal strength during shifts in diet or activity'
        ]
      },
      {
        week: 12,
        benefits: [
          'Long-term Anxiety Control: Sets a permanently lower baseline for daily anxiety, helping you manage stress smoothly and stay grounded',
          'Restful Sleep Support: Promotes the body\'s "rest-and-digest" mode to improve deep, restorative sleep quality',
          'Sustained Mood Harmony: Establishes a highly resilient emotional state, maintaining steady mood stability and connection'
        ]
      }
    ];
  }
  if (normName.includes('ipamorelin') && (normName.includes('cjc') || normName.includes('modified grf'))) {
    return [
      {
        week: 1,
        benefits: [
          'Dual-Pathway Priming: Pituitary priming and dual-pathway activation begin, initiating wave-like growth hormone release; deep slow-wave sleep cycles lengthen significantly, leading to improved morning energy and reduced waking fatigue',
          'Accelerated Sleep Recovery: Speeds up cellular and metabolic recovery during sleep, allowing you to wake up feeling physically refreshed',
          'Enhanced Pituitary Output: Encourages highly selective, pulsatile growth hormone surges without causing cortisol or prolactin spikes'
        ]
      },
      {
        week: 2,
        benefits: [
          'Hepatic IGF-1 Elevation: Promotes elevated systemic growth hormone and liver-derived IGF-1 secretion, accelerating cell renewal and tissue repair pathways',
          'Decreased Joint Stiffness: Enhances extracellular matrix repair and tissue lubrication, reducing exercise-induced soreness and morning joint creaking',
          'Collagen Optimization: Stimulates dermal collagen synthesis, improving skin hydration, density, and natural elasticity'
        ]
      },
      {
        week: 4,
        benefits: [
          'Synergistic Fat Oxidation: Accelerates lipolysis (fat breakdown), specifically targeting deep, stubborn visceral abdominal fat',
          'Lean Muscle Preservation: Sends potent muscle-protective cellular signals that shield lean mass from breaking down, supporting physical tone and stamina',
          'Rapid Structural Healing: Speeds up recovery of minor skin blemishes, muscle pulls, tendon strains, and athletic fatigue'
        ]
      },
      {
        week: 8,
        benefits: [
          'Visually Leaner Composition: Visible reductions in body fat combined with enhanced muscle fullness and definition',
          'Joint Fluid & Flexibility: Promotes healthy synovial fluid production, making daily movement smoother and reducing joint friction',
          'Bone Density Support: Stimulates bone-forming cells to strengthen skeletal density and improve long-term structural integrity'
        ]
      },
      {
        week: 12,
        benefits: [
          'Somatotropic Axis Homeostasis: Reaches maximum improvements in fat-to-muscle partitioning while sustaining high metabolic efficiency',
          'Peak Physical Remodeling: Completes body composition improvements and supports long-term athletic and strength maintenance goals',
          'Resilient Anti-Aging: Restores youthful cell turnover and tissue bounce, leaving muscles, joints, and skin feeling fully recovered'
        ]
      }
    ];
  }
  if (normName.includes('ipamorelin')) {
    return [
      {
        week: 1,
        benefits: [
          'Deep Sleep Enhancement: Stimulates receptors in the pituitary gland to trigger pulsatile growth hormone release, significantly improving deep slow-wave sleep quality',
          'Accelerated Nighttime Recovery: Maximizes the body\'s overnight repair cycle, allowing you to wake up feeling more refreshed and less fatigued',
          'Pituitary Activation: Gentle, highly selective activation of growth hormone pathways without raising cortisol (stress) or prolactin levels'
        ]
      },
      {
        week: 2,
        benefits: [
          'Cellular Regeneration: Elevates natural IGF-1 (insulin-like growth factor 1) secretion from the liver to accelerate cell renewal and tissue repair',
          'Skin Elasticity & Glow: Boosts collagen production, improving skin moisture retention and reducing early signs of fine lines',
          'Initial Metabolic Lift: Begins optimizing the rate at which cells convert nutrients into energy, enhancing daily vitality'
        ]
      },
      {
        week: 4,
        benefits: [
          'Muscle Preservation: Initiates cellular signals that protect lean muscle mass from breaking down, supporting physical tone',
          'Visceral Fat Burn: Promotes lipolysis (fat breakdown), starting the clearance of deep, stubborn visceral fat',
          'Faster Wound Healing: Speeds up recovery from minor skin cuts, muscle pulls, or athletic strains'
        ]
      },
      {
        week: 8,
        benefits: [
          'Visually Leaner Composition: Decreases abdominal fat and improves overall muscle definition',
          'Joint Comfort & Lubrication: Promotes extracellular fluid health, leading to smoother joint movement and reduced friction or creaking',
          'Bone Mineral Support: Stimulates bone-forming cells to build and protect bone density and skeletal structure'
        ]
      },
      {
        week: 12,
        benefits: [
          'Metabolic Homeostasis: Achieves complete balance in the growth hormone axis, sustaining high energy and metabolic efficiency',
          'Peak Physical Remodeling: Reaches maximum improvements in fat-to-muscle ratio, supporting strength maintenance and body composition goals',
          'Systemic Anti-Aging: Restores youthful cell turnover and skin bounce, leaving joints, muscles, and skin feeling resilient and fully recovered'
        ]
      }
    ];
  }
  if (normName.includes('cjc-1295') || normName.includes('cjc 1295') || normName.includes('modified grf')) {
    return [
      {
        week: 1,
        benefits: [
          'Improved Sleep Quality: Gentle stimulation of GHRH receptors helps regulate and lengthen deep slow-wave sleep cycles, leading to more restful nights',
          'Accelerated Nighttime Recovery: Speeds up metabolic recovery during sleep, allowing you to wake up feeling less fatigued and physically refreshed',
          'Gentle Pituitary Stimulation: Encourages natural, wave-like releases of growth hormone without stressing or exhausting the pituitary gland'
        ]
      },
      {
        week: 2,
        benefits: [
          'Enhanced Cell Repair: Elevates natural IGF-1 levels, accelerating repair pathways in muscle, skin, and connective tissues',
          'Decreased Joint Stiffness: Supports tissue lubrication, reducing morning stiffness and physical soreness from exercise or daily activity',
          'Vibrant Skin & Elasticity: Increases internal collagen pathways to help skin hold moisture, improving texture and reducing early wrinkles'
        ]
      },
      {
        week: 4,
        benefits: [
          'Muscle Preservation: Sends cellular signals that shield lean muscle mass from breakdown, supporting tone and physical strength',
          'Visceral Fat Loss: Promotes lipolysis, assisting in the targeted clearance of stubborn, deep abdominal fat',
          'Faster Injury Healing: Speeds up the recovery of minor skin cuts, muscle strains, or tendon discomfort'
        ]
      },
      {
        week: 8,
        benefits: [
          'Visibly Leaner Physique: Decreases fat stores and enhances lean muscle definition, improving overall body composition',
          'Joint Flexibility & Comfort: Supports extracellular fluid health to make joint movement smoother and reduce friction',
          'Skeletal Density Support: Strengthens bone-remodeling cells, aiding in bone mineral density preservation and long-term skeletal health'
        ]
      },
      {
        week: 12,
        benefits: [
          'Metabolic Balance: Achieves full, natural balance in the growth hormone axis, sustaining high energy levels and metabolic efficiency',
          'Peak Composition Remodeling: Achieves maximum improvements in fat-to-muscle ratios, supporting long-term physical goals',
          'Systemic Vitality: Restores youthful cellular repair rates, keeping muscles, joints, and skin feeling resilient and fully recovered'
        ]
      }
    ];
  }
  if (normName.includes('ghrp') || normName.includes('sermorelin') || normName.includes('cjc') || normName.includes('tesamorelin')) {
    return [
      { week: 1, benefits: ['Pituitary receptor (GHS-R1a) activation, pulsatile growth hormone release spikes, improved deep sleep'] },
      { week: 2, benefits: ['Elevated hepatic insulin-like growth factor 1 (IGF-1) secretion, accelerated cell regeneration'] },
      { week: 4, benefits: ['Fat-free mass expansion signals, initial visceral adipose tissue (VAT) lipolysis'] },
      { week: 8, benefits: ['Noticeable decrease in abdominal fat, enhanced muscle tone, and improved joint lubrication'] },
      { week: 12, benefits: ['Peak body composition adjustments (fat loss/muscle preservation) and optimized somatotropic axis balance'] },
    ];
  }
  if (normName.includes('snap-8') || normName.includes('snap 8')) {
    return [
      { week: 1, benefits: ['SNAP-25 displacement in the SNARE complex, initial softening of superficial expression lines'] },
      { week: 2, benefits: ['Decreased facial micro-muscle contraction signal intensity, improved epidermal elasticity'] },
      { week: 4, benefits: ['Measurable wrinkle reduction in orbital and forehead regions (effective in majority of cosmetic subjects)'] },
      { week: 8, benefits: ['Maximum relaxation of facial micro-muscles, visibly smoother forehead and orbital areas'] },
      { week: 12, benefits: ['Accumulated prevention of new wrinkle formation, peak dermal surface leveling'] },
    ];
  }
  if (normName.includes('cagrilintide')) {
    return [
      { week: 1, benefits: ['Dual amylin receptor agonist activation, significant appetite suppression and delayed digestion'] },
      { week: 2, benefits: ['Delayed gastric emptying, reduction in portion size requirements and caloric intake'] },
      { week: 4, benefits: ['Consistent body weight adjustments, improved satiety signaling'] },
      { week: 8, benefits: ['Synergistic fat oxidation (highly effective when paired with GLP-1), decreased cravings'] },
      { week: 12, benefits: ['Major cumulative reduction in total body weight, sustained lifestyle adaptation, and gastric comfort'] },
    ];
  }
  if (normName.includes('glow70') || normName.includes('glow-70') || normName.includes('glow50') || normName.includes('glow-50')) {
    return [
      { week: 1, benefits: ['Increased facial skin glow, hydration, and tissue smoothness'] },
      { week: 2, benefits: ['Increased epidermal turnover rates, initial smoothing of dynamic facial lines'] },
      { week: 4, benefits: ['Upregulation of procollagen type I synthesis (observed in 70% of clinical subjects)'] },
      { week: 8, benefits: ['Significant 22% increase in skin firmness and visible reduction in fine line depth'] },
      { week: 12, benefits: ['Average 28% increase in subdermal echogenic density (collagen/elastin) with up to 51% in top responders'] },
    ];
  }
  if (normName.includes('ghk-cu') || normName.includes('copper peptide')) {
    return [
      {
        week: 1,
        benefits: [
          'Skin Barrier Protection: Delivers vital copper cofactors to deep skin layers, strengthening the skin\'s protective outer barrier',
          'Calming Inflammation: Starts lowering local inflammatory chemicals, reducing redness, skin irritation, and micro-inflammation',
          'Initial Cell Nutrition: Feeds hair follicles and skin cells with essential building blocks to prepare them for active regeneration'
        ]
      },
      {
        week: 2,
        benefits: [
          'Cellular Matrix Activation: Upregulates the production of structural support molecules (extracellular matrix) to begin repairing micro-damage',
          'Antioxidant Support: Boosts natural antioxidant enzymes to neutralize environmental free-radical damage',
          'Follicle Stimulation: Begins waking up dormant hair follicles, encouraging nutrient delivery to the roots'
        ]
      },
      {
        week: 4,
        benefits: [
          'Collagen & Elastin Growth: Accelerates the synthesis of collagen and elastin, increasing skin thickness, volume, and natural bounce',
          'Deep Hydration: Stimulates glycosaminoglycans (water-retaining molecules), dramatically improving skin hydration from within',
          'Follicle Enlargement: Increases the physical size of hair follicles, helping to reverse hair thinning and promote thicker strand growth'
        ]
      },
      {
        week: 8,
        benefits: [
          'Skin Firming & Lifting: Upregulates key architectural proteins (like decorin) to tighten sagging skin and improve facial contours',
          'DNA Repair Activation: Promotes cell-survival and DNA repair pathways, helping correct damage from UV rays or pollution',
          'Wrinkle Reduction: Visibly decreases the depth of fine lines and wrinkles by reinforcing the skin\'s structural scaffolding'
        ]
      },
      {
        week: 12,
        benefits: [
          'Peak Skin Remodeling: Achieves up to a 28% average increase in collagen density, resulting in firmer, younger-looking skin',
          'Hair Thickness & Density: Reaches peak hair follicle enlargement, improving overall hair thickness, density, and follicle strength',
          'Optimal Scar & Wound Healing: Stabilizes tissue remodeling, smoothing out old scar tissues and optimizing the healing of new minor wounds'
        ]
      }
    ];
  }
  if (normName.includes('selank')) {
    return [
      {
        week: 1,
        benefits: [
          'Calming Mental Noise: Amplifies the brain\'s natural calming signals (GABA) and protects comfort chemicals, quietening the background static of anxiety',
          'Social Ease & Security: Soothes the brain\'s alarm system (amygdala), making you feel safer and more relaxed in social environments',
          'Non-Drowsy Stress Buffer: Calms the nervous system without causing drowsiness, brain fog, or physical dependency'
        ]
      },
      {
        week: 2,
        benefits: [
          'Stress Resilience: Balances key brain messengers (like dopamine and serotonin) to help you adapt to high-pressure situations',
          'Stable Cardiovascular Response: Helps regulate blood flow and heart rate responses under stress, preventing physical anxiety symptoms',
          'Reduced Volatility: Lowers general irritability and emotional spikes, helping you maintain a patient, steady mindset'
        ]
      },
      {
        week: 4,
        benefits: [
          'Focused Calm: Combines anxiolytic relaxation with mental focus, improving memory consolidation and learning under pressure',
          'Preserving Natural Comfort: Restricts the breakdown of enkephalins, supporting a more positive emotional baseline',
          'Protecting Brain Cells: Upregulates BDNF (brain-derived neurotrophic factor) to support neural plasticity and protect brain cells from stress'
        ]
      },
      {
        week: 8,
        benefits: [
          'Steady Emotional Baseline: Establishes a highly resilient emotional state, guarding against sudden anxiety spikes',
          'Immune Response Balance: Modulates cytokine activity to promote a healthy immune response and lower systemic inflammation',
          'Synaptic Strength: Enhances communication pathways in the hippocampus, supporting memory retention and cognitive flexibility'
        ]
      },
      {
        week: 12,
        benefits: [
          'Established Quiet Mind: Re-establishes a permanently lower baseline for generalized anxiety, maintaining a quiet, clear mind',
          'Hormonal Stress Reset: Normalizes the body\'s cortisol-release axis, protecting you from chronic burn-out and fatigue',
          'Peak Cognitive Harmony: Integrates absolute emotional peace with sharp mental stamina, optimizing daily performance'
        ]
      }
    ];
  }
  if (normName.includes('semax')) {
    return [
      {
        week: 1,
        benefits: [
          'Immediate Mental Clarity: Quickly triggers the release of key brain growth factors (BDNF and NGF) in memory centers, improving initial cognitive focus and mental clarity',
          'Non-Stimulant Alertness: Enhances attention and alertness without causing the jitters, crashes, or physical anxiety of traditional stimulants',
          'Reducing Brain Fog: Begins clearing brain fog and fatigue, helping you stay sharp during long cognitive tasks'
        ]
      },
      {
        week: 2,
        benefits: [
          'Stress Adaptation: Enhances the brain\'s ability to cope with high-stress tasks, preventing mental burnout and decision fatigue',
          'Memory Consolidation: Strengthens working memory pathways, helping you retain and process new information more efficiently',
          'Dopamine Support: Boosts natural dopamine release to improve motivation, drive, and mental energy'
        ]
      },
      {
        week: 4,
        benefits: [
          'Synaptic Plasticity: Enhances the connections between brain cells, supporting neuroplasticity (the brain\'s ability to learn and adapt to new skills)',
          'Nerve Cell Protection: Promotes long-term neuroprotection, helping defend brain cells from metabolic stress and toxic exposure',
          'Serotonin Balance: Balances serotonin pathways to support emotional stability, mood, and cognitive performance'
        ]
      },
      {
        week: 8,
        benefits: [
          'Focus Stamina: Maintains elevated brain growth factors to support sustained focus and mental stamina over extended work or study periods',
          'Stabilizing Brain Networks: Strengthens neural communication pathways, helping you maintain high productivity and attention under distraction',
          'Nerve Fiber Development: Supports the development and health of nerve fibers in the central nervous system'
        ]
      },
      {
        week: 12,
        benefits: [
          'Elevated Cognitive Baseline: Establishes a permanently higher baseline for memory retrieval, mental speed, and daily intellectual capacity',
          'Neurogenesis Signaling: Stimulates long-term brain cell renewal pathways (neurogenesis), promoting brain health and youthfulness',
          'Calming Anxiety: Balances cognitive stimulation with anxiety reduction, keeping you cool, collected, and highly focused'
        ]
      }
    ];
  }
  if (normName.includes('epitalon') || normName.includes('thymalin') || normName.includes('epithalon')) {
    return [
      { week: 1, benefits: ['Pineal gland regulation, melatonin synthesis optimization, improved circadian rhythm'] },
      { week: 2, benefits: ['Upregulated T-cell immune response and immune cell proliferation activity'] },
      { week: 4, benefits: ['Endocrine system normalization, initial cellular longevity markers adjustment'] },
      { week: 8, benefits: ['Upregulated telomerase gene expression, cellular senescence protection'] },
      { week: 12, benefits: ['Peak immune and hormonal restoration, balanced biological aging markers'] },
    ];
  }
  if (normName.includes('dsip')) {
    return [
      { week: 1, benefits: ['Pituitary delta-sleep-inducing peptide activation, reduced sleep latency'] },
      { week: 2, benefits: ['Enhanced slow-wave sleep percentage, lower morning cortisol and stress scores'] },
      { week: 4, benefits: ['Optimized sleep architecture, normalized baseline hypothalamic-pituitary-adrenal axis'] },
      { week: 8, benefits: ['Sustained circadian rhythm synchronization, improved daytime energy and cognitive focus'] },
      { week: 12, benefits: ['Deep restorative sleep integration, persistent resolution of chronic insomnia markers'] },
    ];
  }

  // Tag-based fallbacks
  if (tags.includes('healing') || tags.includes('recovery')) {
    return [
      { week: 1, benefits: ['Initial recovery adaptation, reduced localized acute swelling'] },
      { week: 2, benefits: ['Improved muscle and joint tissue repair signals'] },
      { week: 4, benefits: ['Enhanced cellular regeneration and structural reinforcement'] },
      { week: 8, benefits: ['Connective tissue remodeling and baseline joint stabilization'] },
      { week: 12, benefits: ['Complete functional integration of repaired fibers, protection against re-injury'] },
    ];
  }
  if (tags.includes('weight-loss') || tags.includes('metabolic')) {
    return [
      { week: 1, benefits: ['Appetite reduction and glycemic adaptation'] },
      { week: 2, benefits: ['Consistent satiety and metabolic rate adjustments'] },
      { week: 4, benefits: ['Visceral fat storage signals decrease'] },
      { week: 8, benefits: ['Optimized caloric efficiency and muscle tissue protection'] },
      { week: 12, benefits: ['Stabilized weight homeostasis, sustainable metabolic adaptation'] },
    ];
  }
  if (tags.includes('longevity') || tags.includes('skin') || tags.includes('anti-aging')) {
    return [
      { week: 1, benefits: ['Restorative sleep cues, cellular vitality support'] },
      { week: 2, benefits: ['Subtle skin elasticity and hydration improvements'] },
      { week: 4, benefits: ['Systemic rejuvenation and longevity markers adaptation'] },
      { week: 8, benefits: ['Improved cellular repair kinetics, visible dermal firming'] },
      { week: 12, benefits: ['Comprehensive age-delaying physiological adjustments, enhanced overall vitality'] },
    ];
  }
  if (tags.includes('cognitive') || tags.includes('brain')) {
    return [
      { week: 1, benefits: ['Mental clarity, acute focus enhancements'] },
      { week: 2, benefits: ['Improved memory recall and stress resilience'] },
      { week: 4, benefits: ['Consistent cognitive stamina and neuroprotection'] },
      { week: 8, benefits: ['Optimized synaptic plasticity and faster brain-derived learning speeds'] },
      { week: 12, benefits: ['Established elevated cognitive performance baseline, sustained mental endurance'] },
    ];
  }

  // Generic fallback timeline
  return [
    { week: 1, benefits: ['Systemic adaptation and initiation phase'] },
    { week: 2, benefits: ['Optimal saturation, improved daily energy'] },
    { week: 4, benefits: ['Consistent therapeutic outcomes and stabilization'] },
    { week: 8, benefits: ['Advanced physiological integration and consolidation'] },
    { week: 12, benefits: ['Peak cumulative therapeutic benefits and baseline maintenance'] },
  ];
}

function getExpectedBenefitsSummaryForSeed(name: string, tags: string[], moa: string | null): string {
  const normName = name.toLowerCase();

  if (normName.includes('testosterone')) {
    return 'Typically tracked for testosterone replacement therapy to support muscle maintenance, energy levels, libido, and bone density. It is intended to help restore physiological hormone levels.';
  }
  if (normName.includes('ara-290') || normName.includes('ara290')) {
    return 'Expected to support small fiber neuropathy relief by calming neuropathic discomfort and supporting nerve repair pathways. It typically aims to reduce burning, tingling, and neuroinflammation.';
  }
  if (normName.includes('kpv')) {
    return 'Typically tracked for anti-inflammatory support in gastrointestinal and skin applications to promote mucosal repair. It is expected to support overall immune modulation and barrier integrity.';
  }
  if (normName.includes('mots-c') || normName.includes('mots c')) {
    return 'Expected to support metabolic function, physical endurance, and cellular energy production during lifestyle adaptation. It is typically monitored for mitochondrial health and vitality.';
  }
  if ((normName.includes('bpc-157') || normName.includes('bpc 157')) && (normName.includes('tb-500') || normName.includes('tb 500'))) {
    return 'Expected to support tissue healing, joint flexibility, and localized inflammation reduction in musculoskeletal recovery. It is designed to assist in tendon, muscle, and ligament repair.';
  }
  if (normName.includes('bpc-157') || normName.includes('bpc 157')) {
    return 'Typically tracked to support soft tissue repair, tendon healing, and gastrointestinal mucosal integrity. It is expected to assist in cellular migration and localized recovery processes.';
  }
  if (normName.includes('tb-500') || normName.includes('tb 500') || normName.includes('thymosin beta')) {
    return 'Expected to support angiogenesis, muscle cell migration, and soft tissue repair in wound healing. It is typically used to promote recovery from acute muscle strains or joint injuries.';
  }
  if (normName.includes('retatrutide')) {
    return 'Typically tracked to support glycemic control, weight management, and metabolic health adaptation. It targets glucagon, GIP, and GLP-1 receptors to support metabolic efficiency.';
  }
  if (normName.includes('semaglutide') || normName.includes('tirzepatide')) {
    return 'Expected to support blood sugar regulation, appetite control, and body weight management. It acts by mimicking incretin hormones to help regulate metabolic signals and food intake.';
  }
  if (normName.includes('nad')) {
    return 'Expected to support cellular repair, longevity pathways, and energy metabolism. It serves as a vital coenzyme to assist in DNA repair and mitochondrial cellular functioning.';
  }
  if (normName.includes('oxytocin')) {
    return 'Typically tracked to support social bonding, stress management, and emotional regulation. It is expected to support neurological responses related to anxiety and social trust.';
  }
  if (normName.includes('ipamorelin') && (normName.includes('cjc') || normName.includes('modified grf'))) {
    return 'Expected to support growth hormone release, muscle preservation, sleep quality, and recovery. It acts synergistically to stimulate pituitary secretion without increasing cortisol levels.';
  }
  if (normName.includes('ipamorelin')) {
    return 'Expected to support growth hormone release, muscle growth, and recovery with minimal impact on appetite. It selectively binds to the ghrelin receptor to support lean body composition.';
  }
  if (normName.includes('cjc-1295') || normName.includes('cjc 1295') || normName.includes('modified grf')) {
    return 'Expected to support growth hormone secretion, lean muscle tissue accumulation, and recovery. It is a growth hormone-releasing hormone analog designed to support recovery cycles.';
  }
  if (normName.includes('ghrp') || normName.includes('sermorelin') || normName.includes('cjc') || normName.includes('tesamorelin')) {
    return 'Typically tracked to support growth hormone release, body composition, and recovery pathways. It is intended to support natural hormone secretion for cellular rejuvenation.';
  }
  if (normName.includes('snap-8') || normName.includes('snap 8')) {
    return 'Expected to support expression line reduction and skin elasticity improvement. It is a cosmetic peptide aimed at relaxing facial muscles to support skin smoothing.';
  }
  if (normName.includes('cagrilintide')) {
    return 'Expected to support appetite regulation and body weight management when paired with GLP-1 analogs. It functions as an amylin analogue to help signal satiety and slow gastric emptying.';
  }
  if (normName.includes('glow70') || normName.includes('glow-70') || normName.includes('glow50') || normName.includes('glow-50')) {
    return 'Expected to support metabolic adaptation, cellular energy, and physical vitality. It is typically monitored for overall metabolic support and physiological balance.';
  }
  if (normName.includes('ghk-cu') || normName.includes('copper peptide')) {
    return 'Expected to support collagen synthesis, skin rejuvenation, and tissue repair pathways. It utilizes copper peptide actions to help support skin elasticity and wound healing.';
  }
  if (normName.includes('selank')) {
    return 'Typically tracked to support anxiety relief, cognitive enhancement, and immune response modulation. It is designed to regulate neurotransmitter balance without sedative effects.';
  }
  if (normName.includes('semax')) {
    return 'Typically tracked to support cognitive function, memory consolidation, and neuroprotection during mental exertion. It is expected to support brain-derived neurotrophic factor levels.';
  }
  if (normName.includes('epitalon') || normName.includes('thymalin') || normName.includes('epithalon')) {
    return 'Expected to support cellular health, telomere maintenance, and sleep quality. It is designed to stimulate melatonin production and support overall cellular longevity pathways.';
  }
  if (normName.includes('dsip')) {
    return 'Expected to support deep sleep induction and physiological stress regulation. It is a delta sleep-inducing peptide designed to support normal sleep architecture and rest.';
  }

  // Tag-based fallbacks
  if (tags.includes('healing') || tags.includes('recovery')) {
    return 'Expected to support tissue repair, muscle recovery, and acute inflammation reduction. It typically aims to enhance cellular regeneration and reinforce tissue integrity.';
  }
  if (tags.includes('weight-loss') || tags.includes('metabolic')) {
    return 'Typically tracked to support glycemic control, weight management, and metabolic rate adaptation. It is designed to assist in fat loss while preserving lean muscle mass.';
  }
  if (tags.includes('longevity') || tags.includes('skin') || tags.includes('anti-aging')) {
    return 'Expected to support cellular rejuvenation, tissue elasticity, and biological vitality. It typically aims to slow senescence pathways and support overall systemic longevity.';
  }
  if (tags.includes('cognitive') || tags.includes('brain')) {
    return 'Typically tracked to support memory consolidation, focus, and neuroprotective pathways. It is intended to support synaptic plasticity and cognitive resilience during exertion.';
  }

  return 'Typically tracked to support general health and physiological repair pathways. It is expected to assist in overall wellness monitoring and lifestyle management.';
}
