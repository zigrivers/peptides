// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CompoundInventoryView } from './CompoundInventoryView';
import type { CompoundInventorySummary } from '@/lib/reconstitution/application/VialService';
import type { Compound } from '@/lib/reference/domain/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/app/actions/reconstitution/set-active-vial', () => ({
  setActiveVialAction: vi.fn().mockResolvedValue({ ok: true }),
}));

function summary(overrides: Partial<CompoundInventorySummary> = {}): CompoundInventorySummary {
  return {
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
    ...overrides,
  };
}

const compounds: Pick<Compound, 'id' | 'name' | 'slug'>[] = [
  { id: 'c1', name: 'BPC-157', slug: 'bpc-157' },
  { id: 'c2', name: 'TB-500', slug: 'tb-500' },
  { id: 'c3', name: 'Ipamorelin', slug: 'ipamorelin' },
];

function renderView(props: Partial<React.ComponentProps<typeof CompoundInventoryView>> = {}) {
  return render(
    <CompoundInventoryView
      userId="user-1"
      summaries={[summary()]}
      compounds={compounds}
      dryVials={[]}
      onReconstitute={vi.fn()}
      onAddVials={vi.fn()}
      {...props}
    />
  );
}

describe('CompoundInventoryView', () => {
  afterEach(() => cleanup());

  it('defaults to "In inventory" and shows compounds that have vials', () => {
    const { getByText, queryByText } = renderView();
    expect(getByText('BPC-157')).toBeTruthy();
    // c2/c3 are not in inventory and should be hidden under the default filter
    expect(queryByText('TB-500')).toBeNull();
  });

  it('shows ready/dry counts and total mg in the row', () => {
    const { getByText } = renderView();
    expect(getByText(/1 ready/)).toBeTruthy();
    expect(getByText(/1 dry/)).toBeTruthy();
  });

  it('switches to "Not in inventory" and lists only compounds with no vials, excluding in-stock ones', () => {
    const { getByRole, getByText, queryByText } = renderView();
    fireEvent.click(getByRole('button', { name: /not in inventory/i }));
    expect(getByText('TB-500')).toBeTruthy();
    expect(getByText('Ipamorelin')).toBeTruthy();
    expect(queryByText('BPC-157')).toBeNull();
  });

  it('"All" shows both in-stock and not-in-stock compounds', () => {
    const { getByRole, getByText } = renderView();
    fireEvent.click(getByRole('button', { name: /^all$/i }));
    expect(getByText('BPC-157')).toBeTruthy();
    expect(getByText('TB-500')).toBeTruthy();
  });

  it('client-side search filters rows by name', () => {
    const { getByPlaceholderText, getByText, queryByText } = renderView({
      summaries: [
        summary(),
        summary({ compoundId: 'c2', compoundName: 'TB-500', compoundSlug: 'tb-500' }),
      ],
    });
    const search = getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'tb' } });
    expect(getByText('TB-500')).toBeTruthy();
    expect(queryByText('BPC-157')).toBeNull();
  });

  it('"Dry only" chip keeps compounds with dry but no reconstituted', () => {
    const { getByRole, getByText, queryByText } = renderView({
      summaries: [
        summary({ reconstitutedCount: 1, dryCount: 1 }),
        summary({
          compoundId: 'c2',
          compoundName: 'TB-500',
          reconstitutedCount: 0,
          dryCount: 2,
        }),
      ],
    });
    fireEvent.click(getByRole('button', { name: /dry only/i }));
    expect(getByText('TB-500')).toBeTruthy();
    expect(queryByText('BPC-157')).toBeNull();
  });

  it('"Ready" chip keeps compounds with a reconstituted vial', () => {
    const { getByRole, getByText, queryByText } = renderView({
      summaries: [
        summary({ compoundId: 'c1', compoundName: 'BPC-157', reconstitutedCount: 1 }),
        summary({
          compoundId: 'c2',
          compoundName: 'TB-500',
          reconstitutedCount: 0,
          dryCount: 1,
        }),
      ],
    });
    fireEvent.click(getByRole('button', { name: /^ready$/i }));
    expect(getByText('BPC-157')).toBeTruthy();
    expect(queryByText('TB-500')).toBeNull();
  });

  it('"Expiring soon" chip keeps compounds with the EXPIRING_SOON badge', () => {
    const { getByRole, getByText, queryByText } = renderView({
      summaries: [
        summary({ worstBadge: 'EXPIRING_SOON' }),
        summary({ compoundId: 'c2', compoundName: 'TB-500', worstBadge: null }),
      ],
    });
    fireEvent.click(getByRole('button', { name: 'Expiring soon' }));
    expect(getByText('BPC-157')).toBeTruthy();
    expect(queryByText('TB-500')).toBeNull();
  });

  it('"Low" chip keeps compounds with LOW_INVENTORY', () => {
    const { getByRole, getByText, queryByText } = renderView({
      summaries: [
        summary({ worstBadge: 'LOW_INVENTORY' }),
        summary({ compoundId: 'c2', compoundName: 'TB-500', worstBadge: null }),
      ],
    });
    fireEvent.click(getByRole('button', { name: /^low$/i }));
    expect(getByText('BPC-157')).toBeTruthy();
    expect(queryByText('TB-500')).toBeNull();
  });

  it('renders doses-left line when dosesLeft + unitsEach present', () => {
    const { getByText } = renderView({
      summaries: [summary({ dosesLeft: 14, unitsEach: '10' })],
    });
    expect(getByText(/14 doses left/)).toBeTruthy();
  });

  it('renders "units vary by vial" copy under mixed concentration', () => {
    const { getByText } = renderView({
      summaries: [
        summary({ dosesLeft: 20, unitsEach: 'varies', hasMixedConcentration: true }),
      ],
    });
    expect(getByText(/units vary by vial/i)).toBeTruthy();
  });

  it('omits doses-left line when dosesLeft is null', () => {
    const { queryByText } = renderView({
      summaries: [summary({ dosesLeft: null, unitsEach: null })],
    });
    expect(queryByText(/doses left/)).toBeNull();
  });

  it('shows expired indicator with discard hint when expiredCount > 0', () => {
    const { getByText } = renderView({
      summaries: [summary({ expiredCount: 2 })],
    });
    expect(getByText(/expired/i)).toBeTruthy();
    expect(getByText(/discard/i)).toBeTruthy();
  });

  it('Reconstitute action resolves the oldest dry vial and calls onReconstitute', () => {
    const onReconstitute = vi.fn();
    const dryVials = [
      {
        id: 'd1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10.000',
        bacWaterMl: null,
        remainingMg: '10.000',
        status: 'DRY',
        reconstitutedAt: null,
        expiresAt: '2026-09-01T00:00:00.000Z',
        daysUntilExpiry: 90,
        badges: [] as never[],
      },
    ];
    const { getByRole } = renderView({ onReconstitute, dryVials });
    fireEvent.click(getByRole('button', { name: /reconstitute/i }));
    expect(onReconstitute).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });

  it('Add vials action calls onAddVials with the compoundId', () => {
    const onAddVials = vi.fn();
    const { getByRole } = renderView({ onAddVials });
    fireEvent.click(getByRole('button', { name: /add vials/i }));
    expect(onAddVials).toHaveBeenCalledWith('c1');
  });

  it('renders the drawing-from selector only when reconstitutedCount >= 2', () => {
    const { queryByRole, rerender } = renderView({
      summaries: [summary({ reconstitutedCount: 1 })],
    });
    expect(queryByRole('combobox')).toBeNull();

    rerender(
      <CompoundInventoryView
        userId="user-1"
        summaries={[
          summary({
            reconstitutedCount: 2,
            activeVial: {
              id: 'r1',
              compoundId: 'c1',
              compoundName: 'BPC-157',
              compoundSlug: 'bpc-157',
              totalMg: '10.000',
              bacWaterMl: '2.000',
              remainingMg: '8.000',
              status: 'RECONSTITUTED',
              reconstitutedAt: null,
              expiresAt: null,
              daysUntilExpiry: null,
              badges: [],
            },
          }),
        ]}
        compounds={compounds}
        dryVials={[
          {
            id: 'r1',
            compoundId: 'c1',
            compoundName: 'BPC-157',
            compoundSlug: 'bpc-157',
            totalMg: '10.000',
            bacWaterMl: '2.000',
            remainingMg: '8.000',
            status: 'RECONSTITUTED',
            reconstitutedAt: null,
            expiresAt: null,
            daysUntilExpiry: null,
            badges: [],
          },
        ]}
        reconstitutedVialsByCompound={{
          c1: [
            {
              id: 'r1',
              compoundId: 'c1',
              compoundName: 'BPC-157',
              compoundSlug: 'bpc-157',
              totalMg: '10.000',
              bacWaterMl: '2.000',
              remainingMg: '8.000',
              status: 'RECONSTITUTED',
              reconstitutedAt: null,
              expiresAt: null,
              daysUntilExpiry: null,
              badges: [],
            },
            {
              id: 'r2',
              compoundId: 'c1',
              compoundName: 'BPC-157',
              compoundSlug: 'bpc-157',
              totalMg: '20.000',
              bacWaterMl: '4.000',
              remainingMg: '12.000',
              status: 'RECONSTITUTED',
              reconstitutedAt: null,
              expiresAt: null,
              daysUntilExpiry: null,
              badges: [],
            },
          ],
        }}
        onReconstitute={vi.fn()}
        onAddVials={vi.fn()}
      />
    );
    expect(queryByRole('combobox')).toBeTruthy();
  });

  it('shows an empty state when there are no vials at all', () => {
    const { getByText } = renderView({ summaries: [] });
    expect(getByText(/no inventory yet/i)).toBeTruthy();
  });

  it('not-in-inventory rows offer an Add affordance', () => {
    const { getByRole, getAllByText } = renderView();
    fireEvent.click(getByRole('button', { name: /not in inventory/i }));
    expect(getAllByText(/none in stock/i).length).toBeGreaterThan(0);
  });

  it('sorts needs-attention compounds before others', () => {
    const { container } = renderView({
      summaries: [
        summary({ compoundId: 'c1', compoundName: 'Zeta', worstBadge: null }),
        summary({ compoundId: 'c2', compoundName: 'Alpha', worstBadge: 'EXPIRED', expiredCount: 1 }),
      ],
    });
    const names = Array.from(container.querySelectorAll('[data-compound-name]')).map(
      (el) => el.getAttribute('data-compound-name')
    );
    expect(names[0]).toBe('Alpha');
    expect(names[1]).toBe('Zeta');
  });
});
