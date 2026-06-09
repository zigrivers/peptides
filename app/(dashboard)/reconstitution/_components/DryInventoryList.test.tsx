// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { updateVialCostAction } from '@/app/actions/reconstitution/inventory-actions';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { DryInventoryList } from './DryInventoryList';

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  deleteVialAction: vi.fn(),
  updateVialCostAction: vi.fn(),
}));

vi.mock('@/lib/reconstitution/domain/audioSynth', () => ({
  getAudioPlayer: () => ({
    playNeedleSnap: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('DryInventoryList', () => {
  const dryVial = {
    id: 'vial-dry-1',
    compoundId: 'comp-1',
    compoundName: 'BPC-157',
    compoundSlug: 'bpc-157',
    totalMg: '10.000',
    bacWaterMl: null,
    remainingMg: '10.000',
    status: 'DRY',
    reconstitutedAt: null,
    expiresAt: '2026-12-31T00:00:00.000Z',
    daysUntilExpiry: 200,
    badges: [],
    cost: null,
    currency: 'USD',
  } as SerializedVialData;

  it('lets the user add cost and currency to a dry vial row', async () => {
    vi.mocked(updateVialCostAction).mockResolvedValue({ ok: true });

    render(
      <DryInventoryList
        vials={[dryVial]}
        compounds={[{ id: 'comp-1', name: 'BPC-157', slug: 'bpc-157', profile: null }]}
        syringeStandard="U100"
        syringeSize="1.0"
        onReconstitute={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('BPC-157'));
    expect(screen.getByText('Cost not set')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /edit cost for vial #1/i }));
    fireEvent.change(screen.getByLabelText(/cost/i), { target: { value: '60.00' } });
    fireEvent.change(screen.getByLabelText(/currency/i), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    await waitFor(() => {
      expect(updateVialCostAction).toHaveBeenCalledWith({
        vialId: 'vial-dry-1',
        cost: '60.00',
        currency: 'EUR',
      });
    });
  });
});
