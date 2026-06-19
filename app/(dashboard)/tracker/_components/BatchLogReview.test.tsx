// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchLogReview } from './BatchLogReview';
import { batchLogDosesAction } from '@/app/actions/tracker/batch-log-doses';
import type { InjectionSite } from '@/lib/tracker/domain/types';

vi.mock('@/app/actions/tracker/batch-log-doses', () => ({
  batchLogDosesAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
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

const defaultSiteSuggestion = {
  suggestion: { bodyPart: 'abdomen-upper', side: 'left' } as InjectionSite,
  validSites: [
    { bodyPart: 'abdomen-upper', side: 'left' },
    { bodyPart: 'abdomen-lower', side: 'right' },
  ] as InjectionSite[],
  siteMeta: [],
  recentSites: [],
};

type TestBatchDueItem = Parameters<typeof BatchLogReview>[0]['items'][number] & {
  siteSuggestion?: typeof defaultSiteSuggestion | null;
};

function dueItem(overrides: Partial<TestBatchDueItem> = {}): TestBatchDueItem {
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
    siteSuggestion: defaultSiteSuggestion,
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
    expect(screen.getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).checked)).toBe(true);
    const button = screen.getByRole('button', { name: 'Log 0 Selected' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
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
    expect(within(panel).getByText('0 selected')).toBeDefined();
    expect(within(panel).queryByText('0 of 2 complete')).toBeNull();
    const button = screen.getByRole('button', { name: 'Log Selected (0)' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('renders a calm empty state when no doses are scheduled today', () => {
    render(<BatchLogReview items={[]} compoundNames={{}} />);

    expect(screen.getByRole('heading', { name: "Today's Dose Plan" })).toBeDefined();
    expect(screen.getByText('No Doses Scheduled Today')).toBeDefined();
    expect(screen.getByText('Use the calendar below to review upcoming regimen days.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Log/i })).toBeNull();
  });

  it('lets the user select a dose and sends the chosen injection site to the batch action', async () => {
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

    expect(screen.getByText('Recommended: Left Upper Abdomen')).toBeDefined();

    fireEvent.change(screen.getByRole('combobox', { name: 'Injection site for BPC-157' }), {
      target: { value: 'right|abdomen-lower' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Log 1 Selected' }));

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith({
        selections: [
          {
            protocolId: 'proto-1',
            doseSlot: 0,
            injectionSite: { bodyPart: 'abdomen-lower', side: 'right' },
          },
        ],
      });
    });
  });

  it('sends the visible local plan date when logging selected sidebar doses', async () => {
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
        scheduledDate="2026-05-25"
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Log 1 Selected' }));

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith({
        scheduledDate: '2026-05-25',
        selections: [
          {
            protocolId: 'proto-1',
            doseSlot: 0,
            injectionSite: { bodyPart: 'abdomen-upper', side: 'left' },
          },
        ],
      });
    });
  });
});
