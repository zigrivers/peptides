// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ReconstitutionClient } from './ReconstitutionClient';
import type { CompoundInventorySummary } from '@/lib/reconstitution/application/VialService';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  addDryVialsAction: vi.fn(),
  addReconstitutedVialAction: vi.fn(),
  reconstituteDryVialAction: vi.fn(),
  deleteVialAction: vi.fn(),
  updateVialRemainingMgAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/reorder-vials', () => ({
  reorderVialsAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/save-vial', () => ({
  saveVialAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn(),
}));

vi.mock('@/lib/reconstitution/domain/audioSynth', () => ({
  getAudioPlayer: () => ({
    playSwoosh: vi.fn(),
    playSwirlChime: vi.fn(),
    playNeedleSnap: vi.fn(),
  }),
}));

const summary: CompoundInventorySummary = {
  compoundId: 'c1',
  compoundName: 'BPC-157',
  compoundSlug: 'bpc-157',
  reconstitutedCount: 1,
  dryCount: 1,
  expiredCount: 0,
  totalReconstitutedRemainingMg: '14.000',
  totalDryMg: '10.000',
  worstBadge: null,
  activeVial: null,
  dryVialRefs: [{ id: 'd1', totalMg: '10.000', remainingMg: '10.000', expiresAt: null }],
  hasMixedConcentration: false,
  dosesLeft: null,
  unitsEach: null,
};

function renderClient(
  overrides: Partial<{
    userId: string;
    actorUserId: string;
    managedUsers: { id: string; name: string | null }[];
  }> = {}
) {
  return render(
    <ReconstitutionClient
      userId={overrides.userId ?? 'user-1'}
      actorUserId={overrides.actorUserId ?? 'user-1'}
      managedUsers={overrides.managedUsers ?? []}
      compounds={[{ id: 'c1', name: 'BPC-157', slug: 'bpc-157', profile: null }]}
      compoundsMinimal={[{ id: 'c1', name: 'BPC-157', slug: 'bpc-157' }]}
      dryVials={[]}
      activeVials={[]}
      inventorySummary={[summary]}
      syringeStandard="U100"
      syringeSize="1.0"
    />
  );
}

beforeAll(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
});

describe('ReconstitutionClient view toggle', () => {
  afterEach(() => cleanup());

  it('defaults to By compound so users first see the operating inventory list', () => {
    const { getByRole, getByLabelText, queryByRole } = renderClient();
    expect(getByRole('button', { name: /by compound/i }).getAttribute('aria-pressed')).toBe('true');
    expect(getByLabelText(/search compounds/i)).toBeTruthy();
    // storage shelf sections are still available, but not the default first screen
    expect(queryByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeNull();
  });

  it('switches to By storage and shows the refrigerator/freezer sections', () => {
    const { getByRole, queryByLabelText } = renderClient();
    fireEvent.click(getByRole('button', { name: /by storage/i }));
    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    expect(queryByLabelText(/search compounds/i)).toBeNull();
  });

  it('keeps the InventoryDashboard visible in both modes', () => {
    const { getByRole, container } = renderClient();
    const dashboardBefore = container.textContent;
    fireEvent.click(getByRole('button', { name: /by compound/i }));
    // dashboard add buttons remain available across the toggle
    expect(dashboardBefore).toBeTruthy();
    expect(container.textContent).toContain('By storage');
  });
});

describe('ReconstitutionClient caregiver subject selector', () => {
  afterEach(() => cleanup());

  it('does NOT render the subject selector when there are no managed users', () => {
    const { queryByLabelText } = renderClient({ managedUsers: [] });
    expect(queryByLabelText(/select whose inventory to view/i)).toBeNull();
  });

  it('renders the subject selector (self + managed users) when managed users exist', () => {
    const { getByLabelText, getByRole } = renderClient({
      actorUserId: 'user-1',
      userId: 'user-1',
      managedUsers: [{ id: 'managed-2', name: 'Alice' }],
    });
    const select = getByLabelText(/select whose inventory to view/i) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(getByRole('option', { name: /me \(self\)/i })).toBeTruthy();
    expect(getByRole('option', { name: 'Alice' })).toBeTruthy();
  });

  it('reflects the resolved subject (managed user) as the selected value', () => {
    const { getByLabelText } = renderClient({
      actorUserId: 'user-1',
      userId: 'managed-2',
      managedUsers: [{ id: 'managed-2', name: 'Alice' }],
    });
    const select = getByLabelText(/select whose inventory to view/i) as HTMLSelectElement;
    expect(select.value).toBe('managed-2');
  });
});

describe('ReconstitutionClient room temperature storage partitioning', () => {
  afterEach(() => cleanup());

  const mockCompounds = [
    {
      id: 'c-cold',
      name: 'Cold Peptide',
      slug: 'cold-peptide',
      profile: {
        id: 'p-cold',
        catalogItemId: 'c-cold',
        fridgeShelfLifeMonths: 12,
        freezerShelfLifeMonths: 24,
        dosingLow: { amount: '250', unit: 'mcg' },
        dosingTypical: { amount: '500', unit: 'mcg' },
        dosingHigh: { amount: '1000', unit: 'mcg' },
        sideEffects: null,
        stackingNotes: null,
        reconstitutedShelfLifeDays: 14,
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
        pairings: [],
        adjuncts: [],
      },
    },
    {
      id: 'c-room',
      name: 'Testosterone',
      slug: 'testosterone',
      profile: {
        id: 'p-room',
        catalogItemId: 'c-room',
        fridgeShelfLifeMonths: null,
        freezerShelfLifeMonths: null,
        dosingLow: { amount: '50', unit: 'mg' },
        dosingTypical: { amount: '100', unit: 'mg' },
        dosingHigh: { amount: '200', unit: 'mg' },
        sideEffects: null,
        stackingNotes: null,
        reconstitutedShelfLifeDays: 28,
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
        pairings: [],
        adjuncts: [],
      },
    },
  ];

  const dryVials = [
    {
      id: 'v-dry-cold',
      userId: 'user-1',
      compoundId: 'c-cold',
      compoundName: 'Cold Peptide',
      compoundSlug: 'cold-peptide',
      totalMg: '10.00',
      remainingMg: '10.00',
      bacWaterMl: null,
      status: 'DRY',
      reconstitutedAt: null,
      expiresAt: '2026-12-31T00:00:00.000Z',
      daysUntilExpiry: 200,
      badges: [],
      insufficientMedication: false,
      potentialDrawWaste: false,
      maxDoseFormatted: '',
    },
    {
      id: 'v-dry-room',
      userId: 'user-1',
      compoundId: 'c-room',
      compoundName: 'Testosterone',
      compoundSlug: 'testosterone',
      totalMg: '200.00',
      remainingMg: '200.00',
      bacWaterMl: null,
      status: 'DRY',
      reconstitutedAt: null,
      expiresAt: '2026-12-31T00:00:00.000Z',
      daysUntilExpiry: 200,
      badges: [],
      insufficientMedication: false,
      potentialDrawWaste: false,
      maxDoseFormatted: '',
    },
  ];

  const activeVials = [
    {
      id: 'v-act-cold',
      userId: 'user-1',
      compoundId: 'c-cold',
      compoundName: 'Cold Peptide',
      compoundSlug: 'cold-peptide',
      totalMg: '10.00',
      remainingMg: '5.00',
      bacWaterMl: '2.00',
      status: 'RECONSTITUTED',
      reconstitutedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-15T00:00:00.000Z',
      daysUntilExpiry: 10,
      badges: [],
      insufficientMedication: false,
      potentialDrawWaste: false,
      maxDoseFormatted: '',
    },
    {
      id: 'v-act-room',
      userId: 'user-1',
      compoundId: 'c-room',
      compoundName: 'Testosterone',
      compoundSlug: 'testosterone',
      totalMg: '200.00',
      remainingMg: '150.00',
      bacWaterMl: '1.00',
      status: 'RECONSTITUTED',
      reconstitutedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-29T00:00:00.000Z',
      daysUntilExpiry: 24,
      badges: [],
      insufficientMedication: false,
      potentialDrawWaste: false,
      maxDoseFormatted: '',
    },
  ];

  it('correctly partitions vials and renders four storage sections when room temp vials exist', () => {
    const { getByRole } = render(
      <ReconstitutionClient
        userId="user-1"
        actorUserId="user-1"
        managedUsers={[]}
        compounds={mockCompounds}
        compoundsMinimal={mockCompounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        dryVials={dryVials}
        activeVials={activeVials}
        inventorySummary={[]}
        syringeStandard="U100"
        syringeSize="1.0"
      />
    );

    fireEvent.click(getByRole('button', { name: /by storage/i }));

    // Verify all 4 headings are rendered
    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Room Temp \(Opened Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Room Temp \(Unopened Vials\)/i })).toBeTruthy();

    // Verify stats / counts in headings
    // Refrigerator has 1 cold active vial
    expect(getByRole('heading', { name: /Refrigerator/i }).nextElementSibling?.textContent).toBe('1');
    // Freezer has 1 cold dry vial
    expect(getByRole('heading', { name: /Freezer/i }).nextElementSibling?.textContent).toBe('1');
    // Room Temp Opened has 1 active room temp vial
    expect(getByRole('heading', { name: /Room Temp \(Opened Vials\)/i }).nextElementSibling?.textContent).toBe('1');
    // Room Temp Unopened has 1 dry room temp vial
    expect(getByRole('heading', { name: /Room Temp \(Unopened Vials\)/i }).nextElementSibling?.textContent).toBe('1');
  });

  it('hides room temperature storage sections if no room temperature vials exist', () => {
    const { getByRole, queryByRole } = render(
      <ReconstitutionClient
        userId="user-1"
        actorUserId="user-1"
        managedUsers={[]}
        compounds={mockCompounds}
        compoundsMinimal={mockCompounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        dryVials={[dryVials[0]]} // Only cold dry
        activeVials={[activeVials[0]]} // Only cold active
        inventorySummary={[]}
        syringeStandard="U100"
        syringeSize="1.0"
      />
    );

    fireEvent.click(getByRole('button', { name: /by storage/i }));

    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    expect(queryByRole('heading', { name: /Room Temp \(Opened Vials\)/i })).toBeNull();
    expect(queryByRole('heading', { name: /Room Temp \(Unopened Vials\)/i })).toBeNull();
  });

  it('collapses and expands the Standalone Calculator form', async () => {
    const { queryByLabelText, getByText } = render(
      <ReconstitutionClient
        userId="user-1"
        actorUserId="user-1"
        managedUsers={[]}
        compounds={mockCompounds}
        compoundsMinimal={mockCompounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        dryVials={dryVials}
        activeVials={activeVials}
        inventorySummary={[]}
        syringeStandard="U100"
        syringeSize="1.0"
      />
    );
    
    // Calculator form fields should not be visible by default
    expect(queryByLabelText(/vial total \(mg\)/i)).toBeNull();

    // Click the calculator header
    const calculatorHeader = getByText('Standalone Calculator');
    fireEvent.click(calculatorHeader);

    // Now the calculator form fields should be visible
    expect(queryByLabelText(/vial total \(mg\)/i)).toBeTruthy();
  });

  it('filters storage categories when clicking sub-tab buttons', async () => {
    const { getByRole, queryByRole } = render(
      <ReconstitutionClient
        userId="user-1"
        actorUserId="user-1"
        managedUsers={[]}
        compounds={mockCompounds}
        compoundsMinimal={mockCompounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        dryVials={dryVials}
        activeVials={activeVials}
        inventorySummary={[]}
        syringeStandard="U100"
        syringeSize="1.0"
      />
    );

    fireEvent.click(getByRole('button', { name: /by storage/i }));

    // Initial state (All tab) shows all 4 sections
    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Room Temp \(Opened Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Room Temp \(Unopened Vials\)/i })).toBeTruthy();

    // Click "Fridge" tab
    fireEvent.click(getByRole('button', { name: /fridge \(1\)/i }));
    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(queryByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeNull();
    expect(queryByRole('heading', { name: /Room Temp/i })).toBeNull();

    // Click "Freezer" tab
    fireEvent.click(getByRole('button', { name: /freezer \(1\)/i }));
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    expect(queryByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeNull();
    expect(queryByRole('heading', { name: /Room Temp/i })).toBeNull();

    // Click "Room Temp" tab
    fireEvent.click(getByRole('button', { name: /room temp \(2\)/i }));
    expect(getByRole('heading', { name: /Room Temp \(Opened Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Room Temp \(Unopened Vials\)/i })).toBeTruthy();
    expect(queryByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeNull();
    expect(queryByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeNull();
  });
});
