// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compound } from '@/lib/reference/domain/types';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { ReconstituteModal } from './ReconstituteModal';

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  reconstituteDryVialAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn().mockResolvedValue({ ok: true }),
}));

const ara290Profile: NonNullable<Compound['profile']> = {
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

const compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[] = [
  {
    id: 'compound-ara-290',
    name: 'ARA-290',
    slug: 'ara-290',
    profile: ara290Profile,
  },
];

const vial: SerializedVialData = {
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

function renderModal() {
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
});
