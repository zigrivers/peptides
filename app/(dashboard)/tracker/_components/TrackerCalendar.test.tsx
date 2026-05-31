// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackerCalendar } from './TrackerCalendar';
import type { Protocol, DoseLog } from '@/lib/tracker/domain/types';
import { logDoseAction } from '@/app/actions/tracker/log-dose';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('@/app/actions/tracker/log-dose', () => ({
  logDoseAction: vi.fn(),
}));

vi.mock('@/app/actions/tracker/reschedule-dose', () => ({
  rescheduleDoseAction: vi.fn(),
}));

vi.mock('@/app/actions/tracker/batch-log-dates', () => ({
  batchLogDatesAction: vi.fn(),
}));

vi.mock('@/app/(dashboard)/dashboard/_components/ConfettiCanvas', () => ({
  ConfettiCanvas: () => null,
}));

describe('TrackerCalendar Component UI/UX with JSDOM', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // System time: May 24, 2026 (which is a Sunday)
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mockCompounds = {
    'compound-tirz': { name: 'Tirzepatide', slug: 'tirzepatide' },
    'compound-sema': { name: 'Semaglutide', slug: 'semaglutide' },
  };

  const mockProtocols: Protocol[] = [
    {
      id: 'proto-1',
      userId: 'user-1',
      compoundId: 'compound-tirz',
      cycleId: null,
      dose: { amount: '2.5', unit: 'mg' as const },
      schedule: { frequency: 'Daily' },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE',
      startDate: new Date('2026-05-01'),
      endDate: null,
      notes: null,
    },
    {
      id: 'proto-2',
      userId: 'user-1',
      compoundId: 'compound-sema',
      cycleId: null,
      dose: { amount: '0.25', unit: 'mg' as const },
      schedule: { frequency: 'EOD' },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE',
      startDate: new Date('2026-05-01'),
      endDate: null,
      notes: null,
    },
  ];

  const mockDoseLogs = [
    {
      id: 'log-1',
      protocolId: 'proto-1',
      userId: 'user-1',
      amount: { amount: '2.5', unit: 'mg' as const },
      status: 'LOGGED' as const,
      loggedAt: '2026-05-25T08:00:00Z',
      scheduledDate: '2026-05-25T00:00:00Z',
      injectionSite: { side: 'left' as const, bodyPart: 'abdomen' },
      note: 'Felt great',
      idempotencyKey: 'key-1',
      vialId: 'vial-1',
      isBatchLog: false,
      loggedByUserId: null,
    },
    {
      id: 'log-2',
      protocolId: 'proto-2',
      userId: 'user-1',
      amount: { amount: '0.25', unit: 'mg' as const },
      status: 'SKIPPED' as const,
      loggedAt: '2026-05-26T08:00:00Z',
      scheduledDate: '2026-05-26T00:00:00Z',
      injectionSite: null,
      note: 'Travel day',
      idempotencyKey: 'key-2',
      vialId: 'vial-2',
      isBatchLog: false,
      loggedByUserId: null,
    },
  ];

  it('renders calendar weekdays and header for current week (May 2026)', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Verify header title shows the month & year of the visible week
    expect(screen.getByText('May 2026')).toBeDefined();

    // Verify weekdays are displayed in the weekly columns
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((day) => {
      const el = screen.getAllByText(day);
      expect(el.length).toBeGreaterThan(0);
    });
  });

  it('renders scheduled, logged, and skipped doses correctly in the selected day action panel', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Click May 25 cell (which has log-1: Logged Tirzepatide)
    const cell25 = screen.getByLabelText(/May 25/);
    fireEvent.click(cell25);

    // Tirzepatide dose log details should show up in the action panel
    expect(screen.getByText('Tirzepatide')).toBeDefined();
    expect(screen.getByText(/Felt great/)).toBeDefined();
    expect(screen.getByText('LOGGED')).toBeDefined();

    // Click May 26 cell (which has log-2: Skipped Semaglutide)
    const cell26 = screen.getByLabelText(/May 26/);
    fireEvent.click(cell26);

    expect(screen.getByText('Semaglutide')).toBeDefined();
    expect(screen.getByText(/Travel day/)).toBeDefined();
    expect(screen.getByText('SKIPPED')).toBeDefined();
  });

  it('navigates to next and previous weeks when pagination buttons are clicked', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Initial state shows May 2026
    expect(screen.getByText('May 2026')).toBeDefined();

    // Click Next Week button
    const nextBtn = screen.getByLabelText('Next Week');
    fireEvent.click(nextBtn); // moves to Week of May 31, which is still May

    fireEvent.click(nextBtn); // moves to Week of June 7
    expect(screen.getByText('June 2026')).toBeDefined();

    // Click Previous Week button
    const prevBtn = screen.getByLabelText('Previous Week');
    fireEvent.click(prevBtn); // Back to May 31
    fireEvent.click(prevBtn); // Back to May 24
    expect(screen.getByText('May 2026')).toBeDefined();
  });

  it('allows inline quick-logging of scheduled doses with site selection and notes', async () => {
    const mockLogDoseAction = vi.mocked(logDoseAction);
    mockLogDoseAction.mockResolvedValue({
      ok: true,
      doseLog: { id: 'new-log-1', status: 'LOGGED' } as unknown as DoseLog,
      warnings: [],
    });

    const mockSiteSuggestions = {
      'proto-1': {
        suggestion: { side: 'left' as const, bodyPart: 'abdomen' },
        validSites: [
          { side: 'left' as const, bodyPart: 'abdomen' },
          { side: 'right' as const, bodyPart: 'abdomen' },
        ],
        siteMeta: [
          { site: { side: 'left' as const, bodyPart: 'abdomen' }, daysSinceLastUse: 3, isRested: false, lastUsed: null },
        ],
        recentSites: [
          { side: 'left' as const, bodyPart: 'abdomen' },
        ],
      },
    };

    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        siteSuggestions={mockSiteSuggestions}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Selecting cell for May 24
    const cell24 = screen.getByLabelText(/May 24/);
    fireEvent.click(cell24);

    // The inline quick-log note input should be present for proto-1 (Tirzepatide)
    const noteInput = screen.getByPlaceholderText('e.g. slight fatigue, felt good') as HTMLInputElement;
    expect(noteInput).toBeDefined();

    // Type notes
    fireEvent.change(noteInput, { target: { value: 'felt excellent' } });

    // Select the suggested site button "Left Abdomen"
    const siteBtn = screen.getByText('Left Abdomen');
    fireEvent.click(siteBtn);

    // Click Log Dose button
    const logBtn = screen.getByRole('button', { name: 'Log Dose' });
    fireEvent.click(logBtn);

    // Assert server action was called
    expect(mockLogDoseAction).toHaveBeenCalledWith({
      protocolId: 'proto-1',
      amount: { amount: '2.5', unit: 'mg' },
      status: 'LOGGED',
      injectionSite: { side: 'left', bodyPart: 'abdomen' },
      note: 'felt excellent',
      scheduledDate: '2026-05-24',
    });
  });

  it('renders abbreviations correctly for 8 scheduled compounds on the same day', () => {
    const eightCompounds = {
      'c-tirz': { name: 'Tirzepatide', slug: 'tirzepatide' },
      'c-sema': { name: 'Semaglutide', slug: 'semaglutide' },
      'c-bpc': { name: 'BPC-157', slug: 'bpc-157' },
      'c-tb': { name: 'TB-500', slug: 'tb-500' },
      'c-ipa': { name: 'Ipamorelin', slug: 'ipamorelin' },
      'c-mt2': { name: 'Melanotan II', slug: 'melanotan-ii' },
      'c-cjc': { name: 'CJC-1295', slug: 'cjc-1295' },
      'c-aod': { name: 'AOD-9604', slug: 'aod-9604' },
    };

    const eightProtocols = Object.keys(eightCompounds).map((cid, index) => ({
      id: `proto-${index + 1}`,
      userId: 'user-1',
      compoundId: cid,
      cycleId: null,
      dose: { amount: '1', unit: 'mg' as const },
      schedule: { frequency: 'Daily' as const },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE' as const,
      startDate: new Date('2026-05-01'),
      endDate: null,
      notes: null,
    }));

    render(
      <TrackerCalendar
        protocols={eightProtocols}
        doseLogs={[]}
        compounds={eightCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    const expectedAbbrevs = ['TIRZ', 'SEMA', 'BPC', 'TB', 'IPA', 'MT2', 'CJC', 'AOD'];
    expectedAbbrevs.forEach((abbrev) => {
      expect(screen.getAllByText(abbrev).length).toBeGreaterThan(0);
    });
  });

  it('renders the current adherence streak badge correctly when loggedDates are provided', () => {
    // System time in test is May 24, 2026.
    // If we have logged dates for May 24, May 23, and May 22, it's a 3-day streak.
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
        loggedDates={['2026-05-24', '2026-05-23', '2026-05-22']}
      />
    );

    expect(screen.getByText('🔥 3 Day Streak')).toBeDefined();
  });
});
