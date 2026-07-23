import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const h = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetCompoundBySlug: vi.fn(),
  mockFindUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: () => h.mockAuth(),
}));

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => h.mockFindUser(...args),
    },
  },
}));

vi.mock('@/lib/reference/application/CompoundService', () => ({
  getCompoundBySlug: (slug: string) => h.mockGetCompoundBySlug(slug),
}));

vi.mock('@/lib/reconstitution/application/VialService', () => ({
  getSerializedVialsForCompound: vi.fn().mockResolvedValue([]),
}));

vi.mock('../_components/CompoundInventoryManager', () => ({
  CompoundInventoryManager: () => null,
}));

vi.mock('../_components/CompoundStorageStabilityGuide', () => ({
  CompoundStorageStabilityGuide: () => null,
}));

vi.mock('../_components/DosingReconstitutionPlanner', () => ({
  DosingReconstitutionPlanner: () => null,
}));

vi.mock('../_components/CompoundResearchPanel', () => ({
  CompoundResearchPanel: () => null,
}));

describe('Catalog compound detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    h.mockFindUser.mockResolvedValue({ syringeStandard: 'U100' });
  });

  it('surfaces peptide dosing range guidance before the deeper calculator', async () => {
    h.mockGetCompoundBySlug.mockResolvedValue({
      id: 'compound-1',
      catalogKey: 'bpc-157',
      kind: 'PEPTIDE',
      name: 'BPC-157',
      slug: 'bpc-157',
      iupacName: null,
      synonyms: ['Pentadecapeptide BPC-157'],
      mechanismOfAction: null,
      administrationRoutes: ['SubQ', 'IM'],
      sourceVersion: 1,
      lastReviewedAt: null,
      revisionStatus: 'PUBLISHED',
      status: 'PUBLISHED',
      tags: ['healing'],
      archivedAt: null,
      profile: {
        id: 'profile-1',
        catalogItemId: 'compound-1',
        dosingLow: {
          amount: '250',
          unit: 'mcg',
          recommendedFrequency: 'Once daily',
          researchBenefits: 'Mild recovery support',
        },
        dosingTypical: {
          amount: '500',
          unit: 'mcg',
          recommendedFrequency: 'Once or twice daily',
          researchBenefits: 'Standard tendon, muscle, and gut barrier healing',
        },
        dosingHigh: {
          amount: '1000',
          unit: 'mcg',
          recommendedFrequency: 'Twice daily',
          researchBenefits: 'Accelerated healing for severe ligament tears',
        },
        sideEffects: null,
        stackingNotes: null,
        reconstitutedShelfLifeDays: null,
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        benefitTimeline: null,
        cycleLengthWeeks: 8,
        cycleRationale: 'Cycle rationale text',
        restPeriodWeeks: 4,
        restPeriodRationale: 'Rest rationale text',
        dosingFrequency: 'DAILY',
        dosesPerDay: 2,
        customFrequencyDescription: null,
        daysOn: 5,
        daysOff: 2,
        preferredTime: 'MORNING_AND_NIGHT',
        timingNotes: 'Take on an empty stomach',
        isFdaApproved: false,
        bodyDuration: {
          halfLifeHours: 0.25,
          halfLifeHoursMax: 0.5,
          effectiveDurationHours: 4,
          effectiveDurationHoursMax: 12,
          certainty: 'UNCERTAIN',
          frequencyImplication:
            'Plasma half-life is short; supports once- or twice-daily research dosing.',
        },
        pairings: [],
        adjuncts: [],
      },
      supplementProfile: null,
      citations: [],
      revisions: [],
    });

    const { default: CompoundProfilePage } = await import('./page');
    const component = await CompoundProfilePage({ params: Promise.resolve({ slug: 'bpc-157' }) });
    const html = renderToString(component);

    expect(html).toContain('Dosing Guidance Ranges');
    expect(html).toContain('Conservative');
    expect(html).toContain('Typical Range');
    expect(html).toContain('Aggressive');
    expect(html).toContain('Once or twice daily');
    expect(html).toContain('Standard tendon, muscle, and gut barrier healing');
    expect(html).toContain('Protocol Snapshot');
    expect(html).toContain('2x Daily: 5 Days On / 2 Off');
    expect(html).toContain('Morning and Night');
    expect(html).toContain('SubQ, IM');
    expect(html).toContain('Body Duration');
    // React SSR encodes & as &amp; in text content
    expect(html).toMatch(/Body Duration &amp; Frequency|Body Duration & Frequency/);
    expect(html).toContain('supports once- or twice-daily research dosing');
  });
});
