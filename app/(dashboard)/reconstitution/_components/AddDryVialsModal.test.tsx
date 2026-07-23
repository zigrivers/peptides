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

const compound2 = {
  ...compound,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'TB-500',
  slug: 'tb-500',
  profile: {
    ...compound.profile,
    id: 'profile-2',
    catalogItemId: '00000000-0000-4000-8000-000000000002',
    freezerShelfLifeMonths: 12,
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

  it('keeps a stable non-filter scrim while form fields update', async () => {
    render(<AddDryVialsModal compounds={[compound]} onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: /add dry vials to freezer/i })).toBeTruthy();
    const scrim = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrim).toBeTruthy();
    expect((scrim as HTMLElement).className).not.toMatch(/backdrop-blur|animate-fade-in/);

    fireEvent.change(screen.getByLabelText(/compound/i), { target: { value: compound.id } });
    fireEvent.change(screen.getByLabelText(/vial size/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/quantity of vials/i), { target: { value: '2' } });

    const scrimAfter = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrimAfter).toBe(scrim);
    expect(document.querySelectorAll('[data-inventory-modal-shell]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /add vials/i })).toBeTruthy();
  });

  it('auto-populates and updates expiration date unless overridden', async () => {
    const onClose = vi.fn();
    render(<AddDryVialsModal compounds={[compound, compound2]} onClose={onClose} />);

    const expiresInput = screen.getByLabelText(/freezer expiration date/i) as HTMLInputElement;
    expect(expiresInput.value).toBe('');

    const compoundSelect = screen.getByLabelText(/compound/i) as HTMLSelectElement;
    fireEvent.change(compoundSelect, { target: { value: compound.id } });

    const now = new Date();
    const expiry1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 24, now.getUTCDate()));
    const expectedDateStr1 = expiry1.toISOString().split('T')[0];
    expect(expiresInput.value).toBe(expectedDateStr1);

    fireEvent.change(compoundSelect, { target: { value: compound2.id } });

    const expiry2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, now.getUTCDate()));
    const expectedDateStr2 = expiry2.toISOString().split('T')[0];
    expect(expiresInput.value).toBe(expectedDateStr2);

    fireEvent.change(expiresInput, { target: { value: '2030-01-01' } });
    expect(expiresInput.value).toBe('2030-01-01');

    fireEvent.change(compoundSelect, { target: { value: compound.id } });
    expect(expiresInput.value).toBe('2030-01-01');
  });
});

