// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchLogReview } from './BatchLogReview';
import { batchLogDosesAction } from '@/app/actions/tracker/batch-log-doses';

vi.mock('@/app/actions/tracker/batch-log-doses', () => ({
  batchLogDosesAction: vi.fn(),
}));

vi.stubGlobal('React', React);

const baseProtocol = {
  id: 'proto-1',
  userId: 'user-1',
  compoundId: 'compound-bpc',
  cycleId: null,
  dose: { amount: '250', unit: 'mcg' as const },
  schedule: { frequency: 'Daily' as const },
  administrationRoute: 'SUBCUTANEOUS',
  status: 'ACTIVE' as const,
  startDate: '2026-05-25T00:00:00.000Z',
  endDate: null,
  notes: null,
};

function dueItem(overrides: Partial<Parameters<typeof BatchLogReview>[0]['items'][number]> = {}) {
  return {
    protocol: baseProtocol,
    doseSlot: 0,
    slotLabel: '',
    existingLog: null,
    availableVials: 1,
    isAvailable: true,
    safetyWarnings: [],
    doseUnits: {
      computable: true,
      unitsText: '5.0 units',
    },
    ...overrides,
  };
}

describe('BatchLogReview', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders today's dose plan as the primary action panel", () => {
    render(
      <BatchLogReview
        items={[
          dueItem(),
          dueItem({
            protocol: {
              ...baseProtocol,
              id: 'proto-2',
              compoundId: 'compound-tb',
              dose: { amount: '2', unit: 'mg' },
            },
            doseSlot: 1,
            slotLabel: 'Evening',
          }),
        ]}
        compoundNames={{ 'compound-bpc': 'BPC-157', 'compound-tb': 'TB-500' }}
      />
    );

    expect(screen.getByRole('heading', { name: "Today's Dose Plan" })).toBeDefined();
    expect(screen.getByText('0 of 2 complete')).toBeDefined();
    expect(screen.getByText('2 doses ready to log')).toBeDefined();

    const panel = screen.getByRole('region', { name: "Today's Dose Plan" });
    expect(within(panel).getByText('BPC-157')).toBeDefined();
    expect(within(panel).getByText('TB-500')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Log 2 Selected' })).toBeDefined();
  });

  it("renders today's dose plan in a compact sidebar variant", () => {
    render(
      <BatchLogReview
        variant="sidebar"
        items={[
          dueItem(),
          dueItem({
            protocol: {
              ...baseProtocol,
              id: 'proto-2',
              compoundId: 'compound-tb',
              dose: { amount: '2', unit: 'mg' },
            },
            doseSlot: 1,
            slotLabel: 'Evening',
          }),
        ]}
        compoundNames={{ 'compound-bpc': 'BPC-157', 'compound-tb': 'TB-500' }}
      />
    );

    const panel = screen.getByRole('region', { name: "Today's Dose Plan" });
    expect(within(panel).getByText('0/2 complete')).toBeDefined();
    expect(within(panel).getByText('2 selected')).toBeDefined();
    expect(within(panel).queryByText('0 of 2 complete')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log Selected (2)' })).toBeDefined();
  });

  it('renders a calm empty state when no doses are scheduled today', () => {
    render(<BatchLogReview items={[]} compoundNames={{}} />);

    expect(screen.getByRole('heading', { name: "Today's Dose Plan" })).toBeDefined();
    expect(screen.getByText('No Doses Scheduled Today')).toBeDefined();
    expect(screen.getByText('Use the calendar below to review upcoming regimen days.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Log/i })).toBeNull();
  });

  it('uses a specific action label and sends selected protocols to the batch action', () => {
    const mockAction = vi.mocked(batchLogDosesAction);
    mockAction.mockResolvedValue({
      ok: true,
      results: [
        {
          ok: true,
          protocolId: 'proto-1',
          doseSlot: 0,
          doseLog: {
            id: 'log-1',
            protocolId: 'proto-1',
            userId: 'user-1',
            vialId: 'vial-1',
            idempotencyKey: 'user-1:proto-1:2026-05-25:0',
            loggedAt: new Date('2026-05-25T12:00:00.000Z'),
            scheduledDate: new Date('2026-05-25T00:00:00.000Z'),
            doseSlot: 0,
            amount: { amount: '250', unit: 'mcg' },
            status: 'LOGGED',
            injectionSite: null,
            isBatchLog: true,
            note: null,
            loggedByUserId: 'user-1',
            loggedCost: null,
            loggedCurrency: null,
          },
          warnings: [],
        },
      ],
    });

    render(
      <BatchLogReview
        items={[dueItem()]}
        compoundNames={{ 'compound-bpc': 'BPC-157' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log 1 Selected' }));

    expect(mockAction).toHaveBeenCalledWith({ selectedProtocolIds: ['proto-1'] });
  });
});
