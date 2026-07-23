// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compound } from '@/lib/reference/domain/types';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { ReconstituteModal, type ReconstituteCompound } from './ReconstituteModal';

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  reconstituteDryVialAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn().mockResolvedValue({ ok: true }),
}));

const richProfile: NonNullable<Compound['profile']> = {
  id: 'profile-bpc-157',
  catalogItemId: 'compound-bpc-157',
  reconstitutedShelfLifeDays: 14,
  fridgeShelfLifeMonths: 12,
  freezerShelfLifeMonths: 24,
  dosingLow: {
    amount: '200',
    unit: 'mcg',
    recommendedFrequency: 'Once daily',
  },
  dosingTypical: {
    amount: '500',
    unit: 'mcg',
    recommendedFrequency: 'Once or twice daily',
  },
  dosingHigh: {
    amount: '1000',
    unit: 'mcg',
    recommendedFrequency: 'Twice daily',
  },
  sideEffects: null,
  stackingNotes: null,
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
  pairings: [],
  adjuncts: [],
};

const sparseProfile: NonNullable<Compound['profile']> = {
  id: 'profile-ara-290',
  catalogItemId: 'compound-ara-290',
  reconstitutedShelfLifeDays: 14,
  fridgeShelfLifeMonths: 12,
  freezerShelfLifeMonths: 24,
  dosingLow: { amount: '2', unit: 'mg' },
  dosingTypical: { amount: '4', unit: 'mg' },
  dosingHigh: { amount: '8', unit: 'mg' },
  sideEffects: null,
  stackingNotes: null,
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
};

const richCompounds: ReconstituteCompound[] = [
  {
    id: 'compound-bpc-157',
    name: 'BPC-157',
    slug: 'bpc-157',
    profile: richProfile,
    administrationRoutes: ['SubQ', 'IM'],
  },
];

const sparseCompounds: ReconstituteCompound[] = [
  {
    id: 'compound-ara-290',
    name: 'ARA-290',
    slug: 'ara-290',
    profile: sparseProfile,
    administrationRoutes: [],
  },
];

const richVial: SerializedVialData = {
  id: 'vial-bpc-157',
  compoundId: 'compound-bpc-157',
  compoundName: 'BPC-157',
  compoundSlug: 'bpc-157',
  totalMg: '10',
  bacWaterMl: null,
  remainingMg: '10',
  status: 'DRY',
  reconstitutedAt: null,
  expiresAt: null,
  daysUntilExpiry: null,
  badges: [],
};

const sparseVial: SerializedVialData = {
  id: 'vial-ara-290',
  compoundId: 'compound-ara-290',
  compoundName: 'ARA-290',
  compoundSlug: 'ara-290',
  totalMg: '10',
  bacWaterMl: null,
  remainingMg: '10',
  status: 'DRY',
  reconstitutedAt: null,
  expiresAt: null,
  daysUntilExpiry: null,
  badges: [],
};

function renderModal(
  compounds: ReconstituteCompound[] = sparseCompounds,
  vial: SerializedVialData = sparseVial
) {
  return render(
    <ReconstituteModal
      vial={vial}
      compounds={compounds}
      initialSyringeStandard="U100"
      initialSyringeSize="0.3"
      onClose={vi.fn()}
    />
  );
}

describe('ReconstituteModal', () => {
  afterEach(() => cleanup());

  it('shows the selected compound low, typical, and high dose ranges', () => {
    renderModal();

    expect(screen.getByText('Dose ranges')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('2 mg')).toBeTruthy();
    expect(screen.getByText('Typical')).toBeTruthy();
    expect(screen.getByText('4 mg')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('8 mg')).toBeTruthy();
  });

  it('shows per-tier dose frequencies and Catalog protocol snapshot fields when present', () => {
    renderModal(richCompounds, richVial);

    expect(screen.getByText('Dose ranges')).toBeTruthy();
    expect(screen.getByText('200 mcg')).toBeTruthy();
    expect(screen.getByText('Once daily')).toBeTruthy();
    expect(screen.getByText('Once or twice daily')).toBeTruthy();
    expect(screen.getByText('Twice daily')).toBeTruthy();

    expect(screen.getByText('Protocol Snapshot')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('2x Daily: 5 Days On / 2 Off')).toBeTruthy();
    expect(screen.getByText('Cycle')).toBeTruthy();
    expect(screen.getByText('8 Weeks')).toBeTruthy();
    expect(screen.getByText('Rest')).toBeTruthy();
    expect(screen.getByText('4 Weeks Washout')).toBeTruthy();
    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('Morning and Night')).toBeTruthy();
    expect(screen.getByText('Route')).toBeTruthy();
    expect(screen.getByText('SubQ, IM')).toBeTruthy();
  });

  it('still reconstitutes when protocol and frequency fields are sparse', () => {
    renderModal();

    // Catalog-equivalent defaults for empty protocol fields — no throw, controls usable
    expect(screen.getByText('Protocol Snapshot')).toBeTruthy();
    expect(screen.getByText('Continuous')).toBeTruthy();
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not Specified')).toBeTruthy();

    // Per-tier frequency copy is omitted when absent (not empty "Frequency:" labels)
    expect(screen.queryByText('Once daily')).toBeNull();
    expect(screen.queryByText('Once or twice daily')).toBeNull();

    // 250 mcg into 2 mL water on a 0.3 mL U-100 syringe stays within capacity
    fireEvent.change(screen.getByLabelText(/bacteriostatic water volume to add/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/target dose/i), { target: { value: '250' } });

    expect(screen.getByText(/Live Reconstitution Metrics/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /complete reconstitution/i })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /complete reconstitution/i }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('calculates water volume from a target syringe pull', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /syringe units/i }));
    fireEvent.change(screen.getByLabelText(/target dose/i), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText(/target syringe pull/i), { target: { value: '30' } });

    expect((screen.getByLabelText(/bacteriostatic water volume to add/i) as HTMLInputElement).value).toBe('0.75');
    expect(screen.getByText(/add 0.75 mL water/i)).toBeTruthy();
    expect(screen.getByText(/30.0 Units/)).toBeTruthy();
    expect(screen.queryByText(/exceeds selected syringe capacity/i)).toBeNull();
  });

  it('keeps a stable non-filter scrim while calculator fields update', () => {
    renderModal();

    const scrim = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrim).toBeTruthy();
    expect((scrim as HTMLElement).className).not.toMatch(/backdrop-blur|animate-fade-in/);
    expect(document.querySelectorAll('[data-inventory-modal-shell]')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/bacteriostatic water volume to add/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/target dose/i), { target: { value: '250' } });

    const scrimAfter = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrimAfter).toBe(scrim);
    expect((scrimAfter as HTMLElement).className).not.toMatch(/backdrop-blur|animate-fade-in/);
    expect(screen.getByText(/Live Reconstitution Metrics/i)).toBeTruthy();
  });
});
