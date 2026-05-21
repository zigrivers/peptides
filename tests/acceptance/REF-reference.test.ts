import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    compound: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
  },
}));

const bpc157 = {
  id: 'c-1',
  name: 'BPC-157',
  slug: 'bpc-157',
  iupacName: 'L-Valyl-L-prolyl-L-prolyl-L-alanyl-glycyl-L-glutaminyl-L-arginyl-L-leucyl-L-phenylalanyl-L-alpha-glutamyl-L-leucyl-L-leucyl-L-tyrosyl-L-leucyl-L-valyl-L-leucyl-L-seryl-L-glutamine',
  synonyms: ['Pentadecapeptide BPC-157'],
  mechanismOfAction: 'Activates growth hormone receptor signalling and promotes angiogenesis.',
  administrationRoutes: ['SubQ', 'IM', 'Oral'],
  status: 'PUBLISHED',
  tags: ['healing', 'recovery'],
  archivedAt: null,
  profile: {
    id: 'p-1',
    compoundId: 'c-1',
    dosingLow: { amount: '200', unit: 'mcg' },
    dosingTypical: { amount: '500', unit: 'mcg' },
    dosingHigh: { amount: '1000', unit: 'mcg' },
    sideEffects: 'Generally well-tolerated.',
    stackingNotes: 'Commonly stacked with TB-500 for enhanced healing.',
    citations: [
      { id: 'cit-1', profileId: 'p-1', title: 'BPC-157 healing study', url: null, doi: '10.1234/bpc', pmid: '12345678' },
    ],
  },
};

const archivedCompound = {
  id: 'c-2',
  name: 'OldPeptide',
  slug: 'oldpeptide',
  iupacName: null,
  synonyms: [],
  mechanismOfAction: null,
  administrationRoutes: [],
  status: 'ARCHIVED',
  tags: [],
  archivedAt: new Date('2025-01-01'),
  profile: null,
};

const noProfileCompound = {
  id: 'c-3',
  name: 'NewPeptide',
  slug: 'newpeptide',
  iupacName: null,
  synonyms: [],
  mechanismOfAction: null,
  administrationRoutes: [],
  status: 'PUBLISHED',
  tags: [],
  archivedAt: null,
  profile: null,
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
      const cit = result?.profile?.citations[0];
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
