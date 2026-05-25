// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TrackerCalendar from './TrackerCalendar';
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

describe('TrackerCalendar Component UI/UX with JSDOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // System time: May 24, 2026
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
      administrationRoute: 'subcutaneous',
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
      administrationRoute: 'subcutaneous',
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
      loggedAt: '2026-05-23T08:00:00Z',
      scheduledDate: '2026-05-23T00:00:00Z',
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
      loggedAt: '2026-05-22T08:00:00Z',
      scheduledDate: '2026-05-22T00:00:00Z',
      injectionSite: null,
      note: 'Travel day',
      idempotencyKey: 'key-2',
      vialId: 'vial-2',
      isBatchLog: false,
      loggedByUserId: null,
    },
  ];

  it('renders calendar weekdays and header for current month (May 2026)', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Verify header title
    expect(screen.getByText('May 2026')).toBeDefined();

    // Verify weekdays
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((day) => {
      expect(screen.getByText(day)).toBeDefined();
    });
  });

  it('renders scheduled, logged, and skipped doses correctly in the calendar cells', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // May 23 has log-1: Logged Tirzepatide dose
    const loggedText = screen.getAllByText('Tirzepatide');
    expect(loggedText.length).toBeGreaterThan(0);

    // May 22 has log-2: Skipped Semaglutide dose
    const skippedText = screen.getAllByText('Semaglutide');
    expect(skippedText.length).toBeGreaterThan(0);
  });

  it('navigates to next and previous months when pagination buttons are clicked', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Initial state: May 2026
    expect(screen.getByText('May 2026')).toBeDefined();

    // Click Next Month (→ button)
    const nextBtn = screen.getByLabelText('Next Month');
    fireEvent.click(nextBtn);
    expect(screen.getByText('June 2026')).toBeDefined();

    // Click Previous Month (← button) twice
    const prevBtn = screen.getByLabelText('Previous Month');
    fireEvent.click(prevBtn); // Back to May
    fireEvent.click(prevBtn); // To April
    expect(screen.getByText('April 2026')).toBeDefined();
  });

  it('opens details modal when a calendar day cell is clicked', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    // Click on the cell for May 23, 2026
    const cell23 = screen.getByLabelText(/May 23/);
    fireEvent.click(cell23);

    // Modal overlay should appear
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: /May 23/ })).toBeDefined();
    expect(screen.getByText(/Felt great/)).toBeDefined();
    expect(screen.getByText(/left abdomen/i)).toBeDefined();
    expect(screen.getByText(/LOGGED/)).toBeDefined();

    // Click close button inside modal
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    // Modal should be gone
    expect(screen.queryByRole('dialog')).toBeNull();
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

    // Click on cell for May 24, 2026
    const cell24 = screen.getByLabelText(/May 24/);
    fireEvent.click(cell24);

    // Verify modal has opened
    expect(screen.getByRole('dialog')).toBeDefined();

    // The quick-log note input should be present
    const noteInput = screen.getByPlaceholderText('e.g. slight fatigue, felt good') as HTMLInputElement;
    expect(noteInput).toBeDefined();

    // Type notes
    fireEvent.change(noteInput, { target: { value: 'felt excellent' } });

    // Select the "Left Abdomen" button (already active as suggested) or click to choose
    const siteBtn = screen.getByText('Left Abdomen');
    expect(siteBtn).toBeDefined();

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
});
