// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { addDryVialsAction } from '@/app/actions/reconstitution/inventory-actions';
import { AddDryVialsModal } from './AddDryVialsModal';

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  addDryVialsAction: vi.fn(),
}));

const compound = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'BPC-157',
  slug: 'bpc-157',
  profile: {
    id: 'profile-1',
    catalogItemId: '00000000-0000-4000-8000-000000000001',
    dosingLow: { amount: '250', unit: 'mcg' },
    dosingTypical: { amount: '500', unit: 'mcg' },
    dosingHigh: { amount: '1000', unit: 'mcg' },
    sideEffects: null,
    stackingNotes: null,
    reconstitutedShelfLifeDays: 28,
    fridgeShelfLifeMonths: 6,
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
    pairings: [],
    adjuncts: [],
  },
};

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('AddDryVialsModal', () => {
  it('exposes dialog semantics and closes on Escape', async () => {
    vi.mocked(addDryVialsAction).mockResolvedValue({ ok: true });
    const onClose = vi.fn();

    render(<AddDryVialsModal compounds={[compound]} onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: /add dry vials to freezer/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
