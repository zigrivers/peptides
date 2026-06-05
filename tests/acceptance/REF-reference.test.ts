import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';

// vi.hoisted is unnecessary here: the factory closure reads these variables
// lazily (only when `await import('@/lib/reference/application/CompoundService')`
// triggers the import chain), by which time the const declarations below have
// already been evaluated. All 11 tests pass — this pattern is safe.
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    catalogItem: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

const bpc157 = {
  id: 'c-1',
  catalogKey: 'bpc-157',
  kind: 'PEPTIDE',
  name: 'BPC-157',
  slug: 'bpc-157',
  iupacName: 'L-Valyl-L-prolyl-L-prolyl-L-alanyl-glycyl-L-glutaminyl-L-arginyl-L-leucyl-L-phenylalanyl-L-alpha-glutamyl-L-leucyl-L-leucyl-L-tyrosyl-L-leucyl-L-valyl-L-leucyl-L-seryl-L-glutamine',
  synonyms: ['Pentadecapeptide BPC-157'],
  mechanismOfAction: 'Activates growth hormone receptor signalling and promotes angiogenesis.',
  administrationRoutes: ['SubQ', 'IM', 'Oral'],
  sourceVersion: 1,
  lastReviewedAt: null,
  revisionStatus: 'PUBLISHED',
  status: 'PUBLISHED',
  tags: ['healing', 'recovery'],
  archivedAt: null,
  profile: {
    id: 'p-1',
    catalogItemId: 'c-1',
    dosingLow: { amount: '200', unit: 'mcg' },
    dosingTypical: { amount: '500', unit: 'mcg' },
    dosingHigh: { amount: '1000', unit: 'mcg' },
    sideEffects: 'Generally well-tolerated.',
    stackingNotes: 'Commonly stacked with TB-500 for enhanced healing.',
    reconstitutedShelfLifeDays: null,
    fridgeShelfLifeMonths: 12,
    freezerShelfLifeMonths: 24,
    benefitTimeline: null,
    cycleLengthWeeks: null,
    cycleRationale: null,
    restPeriodWeeks: null,
    restPeriodRationale: null,
    dosingFrequency: null,
    dosesPerDay: null,
    customFrequencyDescription: null,
    daysOn: null,
    daysOff: null,
    preferredTime: null,
    timingNotes: null,
    isFdaApproved: false,
  },
  supplementProfile: null,
  citations: [
    { id: 'cit-1', catalogItemId: 'c-1', title: 'BPC-157 healing study', url: null, doi: '10.1234/bpc', pmid: '12345678' },
  ],
  sourcePairings: [
    {
      id: 'pair-1',
      sourceCompoundId: 'c-1',
      pairedCompoundId: 'c-tb',
      pairedCompoundName: 'TB-500',
      benefitGoal: 'tissue repair',
      rationale: 'BPC-157 supports localized repair while TB-500 supports repair-cell migration.',
      expectedSynergy: 'Complementary repair signaling plus cell migration.',
      evidenceQuality: 'preclinical',
      safetyCaveats: 'No direct high-quality human combination trial found.',
      avoidIf: 'Active malignancy concern, pregnancy, or clinician-advised avoidance of experimental peptides.',
      timingOrSequencingNotes: 'Render as a research note, not a dosing protocol.',
      bestOverall: true,
      partnerExistsInCatalog: true,
      missingCompoundAction: 'none',
      sortOrder: 0,
      pairedCompound: { name: 'TB-500', slug: 'tb-500' },
      citations: [
        {
          id: 'pc-1',
          pairingId: 'pair-1',
          citationId: 'cit-1',
          citation: { id: 'cit-1', catalogItemId: 'c-1', title: 'BPC-157 healing study', url: null, doi: '10.1234/bpc', pmid: '12345678' },
        },
      ],
    },
  ],
  sourceAdjunctRecommendations: [
    {
      id: 'adjrec-1',
      sourceCompoundId: 'c-1',
      adjunctId: 'adj-1',
      benefitGoal: 'GI tolerability and hydration support',
      rationale: 'Reduced appetite and slowed GI transit can lower fluid intake and increase constipation risk.',
      expectedBenefit: 'Supports hydration habits and constipation prevention without adding another compound.',
      evidenceQuality: 'human_limited',
      safetyCategory: 'SAFETY_MITIGATION',
      safetyCaveats: 'Escalating GI symptoms, persistent vomiting, or suspected dehydration require clinician review.',
      avoidIf: 'Fluid restriction, severe kidney disease, or clinician-directed electrolyte restrictions.',
      implementationNotes: 'Supportive context only; not a peptide dose recommendation.',
      sortOrder: 0,
      adjunct: {
        id: 'adj-1',
        name: 'Hydration and Electrolyte Support',
        slug: 'hydration-and-electrolyte-support',
        category: 'SAFETY_MITIGATION',
        description: 'Structured hydration habits and electrolyte replacement when intake is reduced.',
        evidenceSummary: 'GLP-1 labels and GI guidance support monitoring hydration and constipation risk.',
        safetyNotes: 'Avoid aggressive electrolyte loading when fluids or electrolytes are medically restricted.',
        status: 'PUBLISHED',
      },
      citations: [
        {
          id: 'adjl-1',
          recommendationId: 'adjrec-1',
          citationId: 'adjcit-1',
          citation: {
            id: 'adjcit-1',
            adjunctId: 'adj-1',
            title: 'Treatment for Constipation - NIDDK',
            url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/treatment',
            doi: null,
            pmid: null,
          },
        },
      ],
    },
  ],
};

const compoundWithNoPairings = {
  ...bpc157,
  sourcePairings: [],
  sourceAdjunctRecommendations: [],
};

const archivedCompound = {
  id: 'c-2',
  catalogKey: 'oldpeptide',
  kind: 'PEPTIDE',
  name: 'OldPeptide',
  slug: 'oldpeptide',
  iupacName: null,
  synonyms: [],
  mechanismOfAction: null,
  administrationRoutes: [],
  sourceVersion: 1,
  lastReviewedAt: null,
  revisionStatus: 'PUBLISHED',
  status: 'ARCHIVED',
  tags: [],
  archivedAt: new Date('2025-01-01'),
  profile: null,
  supplementProfile: null,
  citations: [],
  sourcePairings: [],
  sourceAdjunctRecommendations: [],
};

const noProfileCompound = {
  id: 'c-3',
  catalogKey: 'newpeptide',
  kind: 'PEPTIDE',
  name: 'NewPeptide',
  slug: 'newpeptide',
  iupacName: null,
  synonyms: [],
  mechanismOfAction: null,
  administrationRoutes: [],
  sourceVersion: 1,
  lastReviewedAt: null,
  revisionStatus: 'PUBLISHED',
  status: 'PUBLISHED',
  tags: [],
  archivedAt: null,
  profile: null,
  supplementProfile: null,
  citations: [],
  sourcePairings: [],
  sourceAdjunctRecommendations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

const { getCompoundBySlug, searchCompounds, listCompounds } = await import(
  '@/lib/reference/application/CompoundService'
);

/**
 * Story: US-REF-01 — View Compound Profile
 */
describe('US-REF-01: View Compound Profile', () => {
  describe('getCompoundBySlug', () => {
    it('AC-1: returns compound with IUPAC name, mechanism, and administration routes', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.name).toBe('BPC-157');
      expect(result?.iupacName).toContain('L-Val');
      expect(result?.administrationRoutes).toContain('SubQ');
    });

    it('AC-2: profile citations include DOI or PMID links', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      const cit = result?.citations[0];
      expect(cit?.doi ?? cit?.pmid).toBeTruthy();
    });

    it('AC-3: profile includes low, typical, and high dosing amounts', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.dosingLow).toMatchObject({ unit: 'mcg' });
      expect(result?.profile?.dosingTypical).toMatchObject({ unit: 'mcg' });
      expect(result?.profile?.dosingHigh).toMatchObject({ unit: 'mcg' });
    });

    it('AC-4: stacking notes are returned when present', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.stackingNotes).toMatch(/TB-500/);
    });

    it('AC-7: returns structured compound pairings with evidence and citations', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.pairings[0]).toMatchObject({
        pairedCompoundName: 'TB-500',
        pairedCompoundSlug: 'tb-500',
        benefitGoal: 'tissue repair',
        evidenceQuality: 'preclinical',
        safetyCaveats: expect.stringContaining('No direct'),
        bestOverall: true,
        citationRefs: expect.arrayContaining([
          expect.objectContaining({ title: 'BPC-157 healing study', doi: '10.1234/bpc' }),
        ]),
      });
    });

    it('AC-8: returns an empty pairings array when no pairings are curated', async () => {
      mockFindFirst.mockResolvedValue(compoundWithNoPairings);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.pairings).toEqual([]);
    });

    it('AC-9: returns structured supportive adjuncts with safety and citations', async () => {
      mockFindFirst.mockResolvedValue(bpc157);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.adjuncts[0]).toMatchObject({
        adjunctName: 'Hydration and Electrolyte Support',
        adjunctSlug: 'hydration-and-electrolyte-support',
        adjunctCategory: 'SAFETY_MITIGATION',
        benefitGoal: 'GI tolerability and hydration support',
        evidenceQuality: 'human_limited',
        safetyCategory: 'SAFETY_MITIGATION',
        safetyCaveats: expect.stringContaining('persistent vomiting'),
        implementationNotes: expect.stringContaining('not a peptide dose recommendation'),
        citationRefs: expect.arrayContaining([
          expect.objectContaining({ title: 'Treatment for Constipation - NIDDK' }),
        ]),
      });
    });

    it('AC-10: returns an empty adjuncts array when no adjuncts are curated', async () => {
      mockFindFirst.mockResolvedValue(compoundWithNoPairings);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.adjuncts).toEqual([]);
    });

    it('AC-5: returns compound without profile as placeholder (no 404)', async () => {
      mockFindFirst.mockResolvedValue(noProfileCompound);
      const result = await getCompoundBySlug('new-peptide');
      expect(result).not.toBeNull();
      expect(result?.profile).toBeNull();
    });

    it('AC-6: archived compound is returned with archived status', async () => {
      mockFindFirst.mockResolvedValue(archivedCompound);
      const result = await getCompoundBySlug('old-peptide');
      expect(result?.status).toBe('ARCHIVED');
      expect(result?.archivedAt).toBeInstanceOf(Date);
    });

    it('AC-7: returns profile containing cycle and rest period rationales when present', async () => {
      const bpcWithRationales = {
        ...bpc157,
        profile: {
          ...bpc157.profile,
          cycleRationale: 'Test cycle rationale for BPC-157',
          restPeriodRationale: 'Test rest period rationale for BPC-157',
        },
      };
      mockFindFirst.mockResolvedValue(bpcWithRationales);
      const result = await getCompoundBySlug('bpc-157');
      expect(result?.profile?.cycleRationale).toBe('Test cycle rationale for BPC-157');
      expect(result?.profile?.restPeriodRationale).toBe('Test rest period rationale for BPC-157');
    });

    it('returns null for unknown slug', async () => {
      mockFindFirst.mockResolvedValue(null);
      const result = await getCompoundBySlug('does-not-exist');
      expect(result).toBeNull();
    });
  });
});

/**
 * Story: US-REF-02 — Search & Browse Catalog
 */
describe('US-REF-02: Search & Browse Catalog', () => {
  describe('searchCompounds', () => {
    it('AC-1: filters by name fragment (case-insensitive)', async () => {
      mockFindMany.mockResolvedValue([bpc157]);
      const results = await searchCompounds('bpc');
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'bpc', mode: 'insensitive' }) }),
            ]),
          }),
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('BPC-157');
    });

    it('AC-2: filters by category tag', async () => {
      mockFindMany.mockResolvedValue([bpc157]);
      const results = await searchCompounds('', 'healing');
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: expect.objectContaining({ has: 'healing' }) }),
        })
      );
      expect(results[0].tags).toContain('healing');
    });
  });

  describe('listCompounds', () => {
    it('returns only PUBLISHED compounds by default', async () => {
      mockFindMany.mockResolvedValue([bpc157]);
      await listCompounds();
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });

    it('includes ARCHIVED compounds when includeArchived is true', async () => {
      mockFindMany.mockResolvedValue([bpc157, archivedCompound]);
      await listCompounds({ includeArchived: true });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });
  });
});

describe('US-REF-02: Search & Browse Catalog UI Rendering', () => {
  it('renders compound catalog list with why statement and common name badge', async () => {
    const testCompound = {
      ...bpc157,
      name: 'BPC-157 / TB-500',
    };
    mockFindMany.mockResolvedValue([testCompound]);

    const CatalogResults = (await import('@/app/(dashboard)/reference/_components/CatalogResults')).CatalogResults;
    const page = await CatalogResults({
      query: '',
      tag: '',
    });
    const html = renderToString(page);

    // Verify common name badge is rendered
    expect(html).toContain('Wolverine Stack');
    // Verify custom why statement is rendered
    expect(html).toContain('Combines localized blood vessel growth and systemic cell mobility');
  });

  it('renders compound with no custom why statement or common name, falling back to mechanism of action', async () => {
    const testCompound = {
      ...noProfileCompound,
      name: 'Uncommon Peptide',
      mechanismOfAction: 'Increases natural cellular resistance to stress.',
    };
    mockFindMany.mockResolvedValue([testCompound]);

    const CatalogResults = (await import('@/app/(dashboard)/reference/_components/CatalogResults')).CatalogResults;
    const page = await CatalogResults({
      query: '',
      tag: '',
    });
    const html = renderToString(page);

    // Verify common name badge is NOT rendered
    expect(html).not.toContain('Wolverine Stack');
    // Verify mechanismOfAction is rendered as description fallback
    expect(html).toContain('Increases natural cellular resistance to stress.');
  });

  it('renders compound with no custom why or mechanism, falling back to generic description', async () => {
    const testCompound = {
      ...noProfileCompound,
      name: 'Uncommon Peptide 2',
      mechanismOfAction: null,
    };
    mockFindMany.mockResolvedValue([testCompound]);

    const CatalogResults = (await import('@/app/(dashboard)/reference/_components/CatalogResults')).CatalogResults;
    const page = await CatalogResults({
      query: '',
      tag: '',
    });
    const html = renderToString(page);

    // Verify final generic fallback description is rendered
    expect(html).toContain('A specialized compound researched for its unique properties');
  });
});
