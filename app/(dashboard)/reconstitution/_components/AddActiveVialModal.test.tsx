// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addReconstitutedVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { AddActiveVialModal } from './AddActiveVialModal';

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  addReconstitutedVialAction: vi.fn(),
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

function expectedDateInputValue(daysFromToday: number) {
  const now = new Date();
  const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday));
  return expiry.toISOString().slice(0, 10);
}

describe('AddActiveVialModal', () => {
  it('exposes dialog semantics and closes on Escape', async () => {
    const onClose = vi.fn();

    render(<AddActiveVialModal compounds={[compound]} onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: /add reconstituted vial/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('defaults the refrigerator expiration date to the calculated stability date', async () => {
    vi.mocked(addReconstitutedVialAction).mockResolvedValue({ ok: true });

    render(<AddActiveVialModal compounds={[compound]} onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/compound/i), {
      target: { value: compound.id },
    });
    fireEvent.change(screen.getByLabelText(/vial size/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/bac water volume/i), { target: { value: '2' } });

    const expirationInput = screen.getByLabelText(/refrigerator expiration date/i) as HTMLInputElement;
    const expectedExpiry = expectedDateInputValue(28);
    expect(expirationInput.value).toBe(expectedExpiry);

    fireEvent.click(screen.getByRole('button', { name: /add vial/i }));

    await waitFor(() => {
      expect(addReconstitutedVialAction).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expectedExpiry,
        })
      );
    });
  });

  it('submits the calculated expiration date unless the user overrides it', async () => {
    vi.mocked(addReconstitutedVialAction).mockResolvedValue({ ok: true });

    render(<AddActiveVialModal compounds={[compound]} onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/compound/i), {
      target: { value: compound.id },
    });
    fireEvent.change(screen.getByLabelText(/vial size/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/bac water volume/i), { target: { value: '2' } });

    const expirationInput = screen.getByLabelText(/refrigerator expiration date/i) as HTMLInputElement;
    fireEvent.change(expirationInput, { target: { value: '2026-07-14' } });

    fireEvent.click(screen.getByRole('button', { name: /add vial/i }));

    await waitFor(() => {
      expect(addReconstitutedVialAction).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: '2026-07-14',
        })
      );
    });
  });
});
