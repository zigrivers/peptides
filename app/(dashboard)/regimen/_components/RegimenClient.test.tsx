// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RegimenClient } from './RegimenClient';

vi.mock('@/app/actions/tracker/protocol-lifecycle', () => ({
  pauseProtocolAction: vi.fn(),
  resumeProtocolAction: vi.fn(),
  deactivateProtocolAction: vi.fn(),
}));

type ProtocolInput = React.ComponentProps<typeof RegimenClient>['initialProtocols'][number];
type VialInput = React.ComponentProps<typeof RegimenClient>['vials'][number];

function makeProtocol(overrides: Partial<ProtocolInput> = {}): ProtocolInput {
  const compoundId = overrides.compoundId ?? 'compound-bpc';
  return {
    id: overrides.id ?? 'protocol-bpc',
    userId: overrides.userId ?? 'user-1',
    compoundId,
    cycleId: overrides.cycleId ?? null,
    dose: overrides.dose ?? { amount: '250', unit: 'mcg' },
    schedule: overrides.schedule ?? { frequency: 'Daily' },
    administrationRoute: overrides.administrationRoute ?? 'SUBCUTANEOUS',
    status: overrides.status ?? 'ACTIVE',
    startDate: overrides.startDate ?? '2026-05-20T00:00:00.000Z',
    endDate: overrides.endDate ?? null,
    notes: overrides.notes ?? null,
    compound:
      overrides.compound ??
      {
        id: compoundId,
        name: 'BPC-157',
        slug: 'bpc-157',
        mechanismOfAction: 'Tissue repair support',
        administrationRoutes: ['SUBCUTANEOUS'],
        tags: ['recovery', 'healing'],
        profile: null,
      },
  };
}

function makeVial(overrides: Partial<VialInput> = {}): VialInput {
  return {
    id: overrides.id ?? 'vial-bpc',
    userId: overrides.userId ?? 'user-1',
    compoundId: overrides.compoundId ?? 'compound-bpc',
    totalMg: overrides.totalMg ?? '10',
    bacWaterMl: overrides.bacWaterMl ?? '2',
    remainingMg: overrides.remainingMg ?? '1',
    status: overrides.status ?? 'RECONSTITUTED',
  };
}

function renderRegimenClient(
  overrides: Partial<React.ComponentProps<typeof RegimenClient>> = {}
) {
  return render(
    <RegimenClient
      initialProtocols={overrides.initialProtocols ?? [makeProtocol()]}
      vials={overrides.vials ?? [makeVial()]}
      users={
        overrides.users ?? [
          { id: 'user-1', name: 'Ken', syringeStandard: 'U100' },
          { id: 'managed-1', name: 'Alex', syringeStandard: 'U100' },
        ]
      }
      actorUserId={overrides.actorUserId ?? 'user-1'}
      cycles={overrides.cycles}
      doseDisplayByProtocolId={overrides.doseDisplayByProtocolId}
    />
  );
}

describe('RegimenClient summary view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('switches to Summary and renders split dose, frequency, and category labels', () => {
    renderRegimenClient();

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));

    expect(screen.getByRole('table', { name: /active regimen summary/i })).toBeTruthy();
    expect(screen.getByText('BPC-157')).toBeTruthy();
    // Split cells: dose and frequency now render separately (fallback to natural unit when no dd entry).
    expect(screen.getByText('250 mcg')).toBeTruthy();
    expect(screen.getByText('Daily')).toBeTruthy();
    expect(screen.getByText('SUBCUTANEOUS')).toBeTruthy();
    expect(screen.getByText('Started May 20, 2026')).toBeTruthy();
    expect(screen.getByText('Recovery')).toBeTruthy();
    expect(screen.getByText('Healing')).toBeTruthy();
    expect(screen.queryByText('Regimen Refill Planner')).toBeNull();
  });

  it('includes upcoming active protocols and excludes inactive and ended protocols from Summary', () => {
    renderRegimenClient({
      initialProtocols: [
        makeProtocol({ id: 'active-current', compound: { ...makeProtocol().compound, name: 'BPC-157' } }),
        makeProtocol({
          id: 'paused',
          status: 'PAUSED',
          compoundId: 'compound-tb',
          compound: { ...makeProtocol().compound, id: 'compound-tb', name: 'TB-500', tags: ['recovery'] },
        }),
        makeProtocol({
          id: 'future',
          compoundId: 'compound-tesa',
          startDate: '2026-06-20T00:00:00.000Z',
          compound: { ...makeProtocol().compound, id: 'compound-tesa', name: 'Tesamorelin', tags: ['metabolic'] },
        }),
        makeProtocol({
          id: 'ended',
          compoundId: 'compound-ghk',
          endDate: '2026-06-01T00:00:00.000Z',
          compound: { ...makeProtocol().compound, id: 'compound-ghk', name: 'GHK-Cu', tags: ['skin'] },
        }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));

    expect(screen.getByText('BPC-157')).toBeTruthy();
    expect(screen.getByText('Tesamorelin')).toBeTruthy();
    expect(screen.getByText('Starts Jun 20, 2026')).toBeTruthy();
    expect(screen.queryByText('TB-500')).toBeNull();
    expect(screen.queryByText('GHK-Cu')).toBeNull();
  });

  it('updates Summary rows when the selected subject changes', () => {
    renderRegimenClient({
      initialProtocols: [
        makeProtocol(),
        makeProtocol({
          id: 'managed-protocol',
          userId: 'managed-1',
          compoundId: 'compound-tirz',
          dose: { amount: '2.5', unit: 'mg' },
          schedule: { frequency: 'EOD' },
          compound: {
            ...makeProtocol().compound,
            id: 'compound-tirz',
            name: 'Tirzepatide',
            slug: 'tirzepatide',
            tags: ['weight-loss', 'metabolic'],
          },
        }),
      ],
      vials: [
        makeVial(),
        makeVial({ id: 'managed-vial', userId: 'managed-1', compoundId: 'compound-tirz', remainingMg: '20' }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));
    expect(screen.getByText('BPC-157')).toBeTruthy();
    expect(screen.queryByText('Tirzepatide')).toBeNull();

    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'managed-1' } });

    expect(screen.getByText('Tirzepatide')).toBeTruthy();
    expect(screen.getByText('2.5 mg')).toBeTruthy();
    expect(screen.getByText('Every other day')).toBeTruthy();
    expect(screen.getByText('Weight Loss')).toBeTruthy();
    expect(screen.getByText('Metabolic')).toBeTruthy();
    expect(screen.queryByText('BPC-157')).toBeNull();
  });

  it('keeps Cards as the default view with the existing protocol cards', () => {
    renderRegimenClient();

    expect(screen.getByRole('heading', { name: 'BPC-157' })).toBeTruthy();
    expect(screen.getByText('Regimen Refill Planner')).toBeTruthy();
    expect(screen.queryByRole('table', { name: /active regimen summary/i })).toBeNull();
  });

  it('renders the server-built dose, units, and frequency display when provided', () => {
    renderRegimenClient({
      doseDisplayByProtocolId: {
        'protocol-bpc': {
          doseText: '0.45 mg (450 mcg)',
          unitsText: '≈ 3.0 units (U-100)',
          frequencyText: 'Daily',
          perDayNote: null,
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));

    expect(screen.getByText('0.45 mg (450 mcg)')).toBeTruthy();
    expect(screen.getByText('≈ 3.0 units (U-100)')).toBeTruthy();
    expect(screen.getByText('Daily')).toBeTruthy();
  });

  it('renders the reconstitute prompt when no vial concentration is available', () => {
    renderRegimenClient({
      doseDisplayByProtocolId: {
        'protocol-bpc': {
          doseText: '250 mcg',
          unitsText: '· reconstitute to see units',
          frequencyText: 'Daily',
          perDayNote: null,
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));

    expect(screen.getByText('· reconstitute to see units')).toBeTruthy();
  });

  it('renders cycle progress for cycled protocols and Continuous otherwise', () => {
    renderRegimenClient({
      initialProtocols: [
        makeProtocol({
          id: 'cycled',
          cycleId: 'cycle-1',
          startDate: '2026-05-20T00:00:00.000Z',
          compound: {
            ...makeProtocol().compound,
            profile: {
              id: 'profile-bpc',
              dosingLow: null,
              dosingTypical: null,
              dosingHigh: null,
              sideEffects: null,
              stackingNotes: null,
              reconstitutedShelfLifeDays: null,
              cycleLengthWeeks: 8,
              restPeriodWeeks: 4,
              citations: [],
            },
          },
        }),
        makeProtocol({
          id: 'continuous',
          compoundId: 'compound-tb',
          startDate: '2026-05-20T00:00:00.000Z',
          compound: { ...makeProtocol().compound, id: 'compound-tb', name: 'TB-500', tags: [] },
        }),
      ],
      vials: [
        makeVial(),
        makeVial({ id: 'vial-tb', compoundId: 'compound-tb', remainingMg: '5' }),
      ],
      cycles: {
        'cycle-1': { startDate: '2026-05-20T00:00:00.000Z', endDate: null },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /summary/i }));

    // 2026-06-08 is in week 3 of an 8-week cycle that started 2026-05-20.
    expect(screen.getByText(/Week 3 of 8/)).toBeTruthy();
    expect(screen.getByText('Continuous')).toBeTruthy();
  });
});
