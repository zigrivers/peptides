// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TrackerCalendar, getWeekInfo } from './TrackerCalendar';
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
      loggedCost: null,
      loggedCurrency: null,
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
      loggedCost: null,
      loggedCurrency: null,
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

  it('shows logged dose amount as mcg plus syringe units when available', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={[
          {
            ...mockDoseLogs[0],
            loggedDoseDisplay: '2500 mcg (10 units)',
          },
        ]}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    fireEvent.click(screen.getByLabelText(/May 25/));

    expect(screen.getByText('2500 mcg (10 units)')).toBeDefined();
    expect(screen.queryByText('2.5 mg')).toBeNull();
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

  it('renders calendar and inline dose actions as touch-sized controls', () => {
    render(
      <TrackerCalendar
        protocols={mockProtocols}
        doseLogs={mockDoseLogs}
        compounds={mockCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    expect(screen.getByRole('button', { name: 'Today' }).className).toContain('min-h-9');
    expect(screen.getByLabelText('Previous Week').className).toContain('min-h-9');
    expect(screen.getByLabelText('Next Week').className).toContain('min-h-9');

    fireEvent.click(screen.getByLabelText(/May 24/));

    expect(screen.getByRole('button', { name: 'Log Dose' }).className).toContain('min-h-9');
    expect(screen.getByRole('button', { name: 'Skip' }).className).toContain('min-h-9');
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

    // Select an injection site manually.
    fireEvent.click(screen.getByText('Left Lower Abdomen'));

    // Click Log Dose button
    const logBtn = screen.getByRole('button', { name: 'Log Dose' });
    fireEvent.click(logBtn);

    // Assert server action was called
    expect(mockLogDoseAction).toHaveBeenCalledWith({
      protocolId: 'proto-1',
      amount: { amount: '2.5', unit: 'mg' },
      status: 'LOGGED',
      injectionSite: { side: 'left', bodyPart: 'abdomen-lower' },
      note: 'felt excellent',
      scheduledDate: '2026-05-24',
    });
  });

  it('labels site history relative to the selected calendar date, not loggedAt or stale server metadata', () => {
    const testosteroneProtocol: Protocol = {
      id: 'proto-test',
      userId: 'user-1',
      compoundId: 'compound-test',
      cycleId: null,
      dose: { amount: '15', unit: 'IU' },
      schedule: { frequency: 'Daily' },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE',
      startDate: new Date('2026-06-01'),
      endDate: null,
      notes: null,
    };

    const staleSiteSuggestions = {
      'proto-test': {
        suggestion: { side: 'left' as const, bodyPart: 'abdomen-upper' },
        validSites: [
          { side: 'left' as const, bodyPart: 'abdomen-upper' },
          { side: 'right' as const, bodyPart: 'abdomen-upper' },
          { side: 'left' as const, bodyPart: 'abdomen-lower' },
          { side: 'right' as const, bodyPart: 'abdomen-lower' },
          { side: 'left' as const, bodyPart: 'thigh' },
          { side: 'right' as const, bodyPart: 'thigh' },
        ],
        siteMeta: [
          {
            site: { side: 'right' as const, bodyPart: 'thigh' },
            lastUsed: new Date('2026-06-09T08:00:00Z'),
            daysSinceLastUse: 0,
            isRested: false,
          },
        ],
        recentSites: [{ side: 'right' as const, bodyPart: 'thigh' }],
      },
    };

    render(
      <TrackerCalendar
        protocols={[testosteroneProtocol]}
        doseLogs={[
          {
            id: 'log-test-mon',
            protocolId: 'proto-test',
            userId: 'user-1',
            amount: { amount: '15', unit: 'IU' },
            status: 'LOGGED',
            loggedAt: '2026-06-09T08:00:00Z',
            scheduledDate: '2026-06-08T00:00:00Z',
            injectionSite: { side: 'right', bodyPart: 'thigh' },
            note: null,
            idempotencyKey: 'key-test-mon',
            vialId: null,
            isBatchLog: false,
            loggedByUserId: null,
            loggedCost: null,
            loggedCurrency: null,
          },
        ]}
        compounds={{ 'compound-test': { name: 'Testosterone', slug: 'testosterone' } }}
        siteSuggestions={staleSiteSuggestions}
        initialDateISO="2026-06-09T00:00:00.000Z"
      />
    );

    fireEvent.click(screen.getByLabelText(/June 9/));

    const rightThighButton = screen.getByText('Right Thigh').closest('button');
    expect(rightThighButton).not.toBeNull();
    expect(within(rightThighButton!).getByText('Yesterday')).toBeDefined();
    expect(within(rightThighButton!).queryByText('Today')).toBeNull();

    fireEvent.click(rightThighButton!);
    expect(screen.getByText(/Right Thigh was your last Testosterone site yesterday/i)).toBeDefined();
    expect(screen.queryByText(/This site was used for your last dose/)).toBeNull();
  });

  it('does not use future logs when showing site guidance for an earlier selected date', () => {
    const testosteroneProtocol: Protocol = {
      id: 'proto-test',
      userId: 'user-1',
      compoundId: 'compound-test',
      cycleId: null,
      dose: { amount: '15', unit: 'IU' },
      schedule: { frequency: 'Daily' },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE',
      startDate: new Date('2026-06-01'),
      endDate: null,
      notes: null,
    };

    render(
      <TrackerCalendar
        protocols={[testosteroneProtocol]}
        doseLogs={[
          {
            id: 'log-test-mon',
            protocolId: 'proto-test',
            userId: 'user-1',
            amount: { amount: '15', unit: 'IU' },
            status: 'LOGGED',
            loggedAt: '2026-06-08T08:00:00Z',
            scheduledDate: '2026-06-08T00:00:00Z',
            injectionSite: { side: 'right', bodyPart: 'thigh' },
            note: null,
            idempotencyKey: 'key-test-mon',
            vialId: null,
            isBatchLog: false,
            loggedByUserId: null,
            loggedCost: null,
            loggedCurrency: null,
          },
        ]}
        compounds={{ 'compound-test': { name: 'Testosterone', slug: 'testosterone' } }}
        siteSuggestions={{
          'proto-test': {
            suggestion: { side: 'left', bodyPart: 'abdomen-upper' },
            validSites: [{ side: 'right', bodyPart: 'thigh' }],
            siteMeta: [
              {
                site: { side: 'right', bodyPart: 'thigh' },
                lastUsed: new Date('2026-06-08T08:00:00Z'),
                daysSinceLastUse: 0,
                isRested: false,
              },
            ],
            recentSites: [{ side: 'right', bodyPart: 'thigh' }],
          },
        }}
        initialDateISO="2026-06-07T00:00:00.000Z"
      />
    );

    fireEvent.click(screen.getByLabelText(/June 7/));

    const rightThighButton = screen.getByText('Right Thigh').closest('button');
    expect(rightThighButton).not.toBeNull();
    expect(within(rightThighButton!).getByText('Never')).toBeDefined();

    fireEvent.click(rightThighButton!);
    expect(screen.queryByText(/Rotation Alert/)).toBeNull();
  });

  it('does not count the current log as a rotation conflict while editing it', () => {
    const testosteroneProtocol: Protocol = {
      id: 'proto-test',
      userId: 'user-1',
      compoundId: 'compound-test',
      cycleId: null,
      dose: { amount: '15', unit: 'IU' },
      schedule: { frequency: 'Daily' },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE',
      startDate: new Date('2026-06-01'),
      endDate: null,
      notes: null,
    };

    render(
      <TrackerCalendar
        protocols={[testosteroneProtocol]}
        doseLogs={[
          {
            id: 'log-test-mon',
            protocolId: 'proto-test',
            userId: 'user-1',
            amount: { amount: '15', unit: 'IU' },
            status: 'LOGGED',
            loggedAt: '2026-06-08T08:00:00Z',
            scheduledDate: '2026-06-08T00:00:00Z',
            injectionSite: { side: 'right', bodyPart: 'thigh' },
            note: null,
            idempotencyKey: 'key-test-mon',
            vialId: null,
            isBatchLog: false,
            loggedByUserId: null,
            loggedCost: null,
            loggedCurrency: null,
          },
        ]}
        compounds={{ 'compound-test': { name: 'Testosterone', slug: 'testosterone' } }}
        siteSuggestions={{
          'proto-test': {
            suggestion: { side: 'left', bodyPart: 'abdomen-upper' },
            validSites: [{ side: 'right', bodyPart: 'thigh' }],
            siteMeta: [
              {
                site: { side: 'right', bodyPart: 'thigh' },
                lastUsed: new Date('2026-06-08T08:00:00Z'),
                daysSinceLastUse: 0,
                isRested: false,
              },
            ],
            recentSites: [{ side: 'right', bodyPart: 'thigh' }],
          },
        }}
        initialDateISO="2026-06-08T00:00:00.000Z"
      />
    );

    fireEvent.click(screen.getByLabelText(/June 8/));
    fireEvent.click(screen.getByRole('button', { name: /Testosterone/i }));
    fireEvent.click(screen.getByText('Edit Log'));

    expect(screen.queryByText(/Rotation Alert/)).toBeNull();
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

  it('collapses panels by default, expands on click, displays unitsText, and shows cycle progress', () => {
    const customProtocols: Protocol[] = [
      {
        id: 'proto-cycled',
        userId: 'user-1',
        compoundId: 'compound-tirz',
        cycleId: 'cycle-1',
        dose: { amount: '2.5', unit: 'mg' as const },
        schedule: { frequency: 'Daily' },
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date('2026-05-01'),
        endDate: null,
        notes: null,
      },
    ];

    const customCompounds = {
      'compound-tirz': {
        name: 'Tirzepatide',
        slug: 'tirzepatide',
        profile: {
          cycleLengthWeeks: 8,
          restPeriodWeeks: 4,
          cycleRationale: null,
          restPeriodRationale: null,
        },
      },
    };

    const customCycles = {
      'cycle-1': {
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: null,
      },
    };

    const customDoseLogs = [
      {
        id: 'log-cycled',
        protocolId: 'proto-cycled',
        userId: 'user-1',
        amount: { amount: '2.5', unit: 'mg' as const },
        status: 'LOGGED' as const,
        loggedAt: '2026-05-25T08:00:00Z',
        scheduledDate: '2026-05-25T00:00:00Z',
        injectionSite: { side: 'left' as const, bodyPart: 'abdomen-upper' },
        note: 'Feeling good',
        idempotencyKey: 'key-cycled',
        vialId: 'vial-1',
        isBatchLog: false,
        loggedByUserId: null,
        loggedCost: null,
        loggedCurrency: null,
      },
    ];

    const customDoseUnits = {
      'compound-tirz': {
        computable: true,
        unitsText: '≈ 10.0 units · ~2.5 mg',
      },
    };

    render(
      <TrackerCalendar
        protocols={customProtocols}
        doseLogs={customDoseLogs}
        compounds={customCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
        cycles={customCycles}
        doseUnitsByCompoundId={customDoseUnits}
      />
    );

    // Select May 24th cell (scheduled) to verify units text displays
    const cell24 = screen.getByLabelText(/May 24/);
    fireEvent.click(cell24);
    expect(screen.getByText('Tirzepatide')).toBeDefined();
    expect(screen.getAllByText(/2.5 mg/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(≈ 10.0 units · ~2.5 mg\)/)).toBeDefined();

    // Select May 25th cell (logged)
    const cell25 = screen.getByLabelText(/May 25/);
    fireEvent.click(cell25);

    // The header should be visible and display compound name and dose amount, but NOT unitsText (gated for processed)
    expect(screen.getByText('Tirzepatide')).toBeDefined();
    expect(screen.getAllByText(/2.5 mg/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\(≈ 10.0 units · ~2.5 mg\)/)).toBeNull();

    // The detail panel should NOT be visible by default (collapsed accordion)
    expect(screen.queryByText('Cycle Progress')).toBeNull();
    expect(screen.queryByText('Injection Site:')).toBeNull();

    // Click on the header row to expand the accordion
    const headerRow = screen.getByRole('button', { name: /Tirzepatide/i });
    fireEvent.click(headerRow);

    expect(screen.getByText('Injection Site:')).toBeDefined();
    expect(screen.getAllByText(/Left Upper Abdomen/).length).toBeGreaterThan(0);
    expect(screen.getByText('Cycle Progress')).toBeDefined();
    expect(screen.getByText(/Week 4 of 8 \(50%\) — rest period of 4 weeks starts ~Jun 26/)).toBeDefined();

    // Click header row again to collapse
    fireEvent.click(headerRow);
    expect(screen.queryByText('Cycle Progress')).toBeNull();
  });

  it('renders expected benefits milestones (current, upcoming, and past) in the expanded logged card', () => {
    const customProtocols: Protocol[] = [
      {
        id: 'proto-benefits',
        userId: 'user-1',
        compoundId: 'compound-tirz',
        cycleId: 'cycle-1',
        dose: { amount: '2.5', unit: 'mg' as const },
        schedule: { frequency: 'Daily' },
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date('2026-05-01'),
        endDate: null,
        notes: null,
      },
    ];

    const customCompounds = {
      'compound-tirz': {
        name: 'Tirzepatide',
        slug: 'tirzepatide',
        profile: {
          cycleLengthWeeks: 8,
          restPeriodWeeks: 4,
          cycleRationale: null,
          restPeriodRationale: null,
          benefitTimeline: [
            { week: 2, benefits: ['Initial gut mucosal adaptation'] },
            { week: 4, benefits: ['Reduction of localized inflammation'] },
            { week: 5, benefits: ['Improved muscle repair'] },
          ],
        },
      },
    };

    const customCycles = {
      'cycle-1': {
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: null,
      },
    };

    const customDoseLogs = [
      {
        id: 'log-benefits',
        protocolId: 'proto-benefits',
        userId: 'user-1',
        amount: { amount: '2.5', unit: 'mg' as const },
        status: 'LOGGED' as const,
        loggedAt: '2026-05-25T08:00:00Z',
        scheduledDate: '2026-05-25T00:00:00Z',
        injectionSite: { side: 'left' as const, bodyPart: 'abdomen-upper' },
        note: 'Feeling good',
        idempotencyKey: 'key-benefits',
        vialId: 'vial-1',
        isBatchLog: false,
        loggedByUserId: null,
        loggedCost: null,
        loggedCurrency: null,
      },
    ];

    render(
      <TrackerCalendar
        protocols={customProtocols}
        doseLogs={customDoseLogs}
        compounds={customCompounds}
        initialDateISO="2026-05-24T00:00:00.000Z"
        cycles={customCycles}
      />
    );

    // Select May 25th cell (Week 4 milestone day)
    const cell25 = screen.getByLabelText(/May 25/);
    fireEvent.click(cell25);

    // Expand the card
    const headerRow = screen.getByRole('button', { name: /Tirzepatide/i });
    fireEvent.click(headerRow);

    // Verify Injection Site is rendered
    expect(screen.getAllByText(/Left Upper Abdomen/).length).toBeGreaterThan(0);

    // Verify main block header shows up
    expect(screen.getByText('Expected Benefits (Week 4)')).toBeDefined();

    // Verify Current Milestone benefits
    expect(screen.getByText('Current Milestone')).toBeDefined();
    expect(screen.getByText('Reduction of localized inflammation')).toBeDefined();

    // Verify Upcoming Milestones benefits and countdown
    expect(screen.getByText('Upcoming Milestones')).toBeDefined();
    expect(screen.getByText('Week 5:')).toBeDefined();
    expect(screen.getByText(/Improved muscle repair/)).toBeDefined();
    expect(screen.getByText(/(starts in ~4 days)/)).toBeDefined();

    // Verify Past Milestones is rendered as collapsible details summary
    expect(screen.getByText('Past Milestones')).toBeDefined();
    expect(screen.getByText('Week 2:')).toBeDefined();
    expect(screen.getByText('Initial gut mucosal adaptation')).toBeDefined();
  });

  it('renders expected benefits milestones for logged continuous protocols', () => {
    const testosteroneProtocol: Protocol = {
      id: 'proto-testosterone',
      userId: 'user-1',
      compoundId: 'compound-testosterone',
      cycleId: null,
      dose: { amount: '30000', unit: 'mcg' },
      schedule: { frequency: 'Daily' },
      administrationRoute: 'INTRAMUSCULAR',
      status: 'ACTIVE',
      startDate: new Date('2026-05-01'),
      endDate: null,
      notes: null,
    };

    render(
      <TrackerCalendar
        protocols={[testosteroneProtocol]}
        doseLogs={[
          {
            id: 'log-testosterone',
            protocolId: 'proto-testosterone',
            userId: 'user-1',
            amount: { amount: '30000', unit: 'mcg' },
            status: 'LOGGED',
            loggedAt: '2026-05-25T08:00:00Z',
            scheduledDate: '2026-05-25T00:00:00Z',
            injectionSite: { side: 'right', bodyPart: 'thigh' },
            note: null,
            idempotencyKey: 'key-testosterone',
            vialId: null,
            isBatchLog: false,
            loggedByUserId: null,
            loggedCost: null,
            loggedCurrency: null,
          },
        ]}
        compounds={{
          'compound-testosterone': {
            name: 'Testosterone',
            slug: 'testosterone',
            profile: {
              cycleLengthWeeks: null,
              restPeriodWeeks: null,
              benefitTimeline: [
                { week: 1, benefits: ['Replacement onset'] },
                { week: 4, benefits: ['Therapeutic response window'] },
                { week: 8, benefits: ['Erythropoiesis signal'] },
              ],
            },
          },
        }}
        initialDateISO="2026-05-24T00:00:00.000Z"
      />
    );

    fireEvent.click(screen.getByLabelText(/May 25/));
    fireEvent.click(screen.getByRole('button', { name: /Testosterone/i }));

    expect(screen.getByText('Continuous Protocol')).toBeDefined();
    expect(screen.getByText('Expected Benefits (Week 4)')).toBeDefined();
    expect(screen.getByText('Therapeutic response window')).toBeDefined();
    expect(screen.getByText('Upcoming Milestones')).toBeDefined();
    expect(screen.getByText('Week 8:')).toBeDefined();
    expect(screen.getByText('Erythropoiesis signal')).toBeDefined();
    expect(screen.getByText('Past Milestones')).toBeDefined();
    expect(screen.getByText('Replacement onset')).toBeDefined();
  });
});

describe('getWeekInfo Unit Tests', () => {
  it('returns continuous info with elapsed milestone timing when cycleLengthWeeks is missing', () => {
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: null },
      '2026-05-15',
      null
    );
    expect(res).toEqual({
      isContinuous: true,
      weekNumber: 3,
      totalWeeks: 1,
      percent: null,
      restStartDate: null,
      elapsedDays: 14,
    });
  });

  it('returns null if proto is undefined', () => {
    const res = getWeekInfo(
      undefined,
      { cycleLengthWeeks: 8 },
      '2026-05-15',
      null
    );
    expect(res).toBeNull();
  });

  it('calculates correct week number and elapsed days for cycled protocols', () => {
    // Start date May 1, event date May 25 (24 days elapsed)
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8, restPeriodWeeks: 4 },
      '2026-05-25',
      null
    );
    expect(res).toEqual({
      isContinuous: false,
      weekNumber: 4, // 24 / 7 = 3, so week 4
      totalWeeks: 8,
      percent: 50,
      restStartDate: new Date('2026-06-26T00:00:00.000Z'), // 56 days after May 1
      elapsedDays: 24,
    });
  });

  it('correctly uses cycle database record for dates if cycleId matches', () => {
    const cycles = {
      'cycle-abc': {
        startDate: '2026-05-10T00:00:00.000Z',
        endDate: '2026-07-05T00:00:00.000Z',
      },
    };
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: 'cycle-abc' },
      { cycleLengthWeeks: 8 },
      '2026-05-15',
      cycles
    );
    expect(res?.elapsedDays).toBe(5); // May 15 - May 10
    expect(res?.weekNumber).toBe(1);
    expect(res?.restStartDate).toEqual(new Date('2026-07-06T00:00:00.000Z')); // uses cycleEndDate + 1 day (since endDate is inclusive)
  });

  it('handles exact cycle boundary (last day and overflow day)', () => {
    // Start date May 1, totalWeeks = 8
    // Last day of cycle: 8 weeks * 7 = 56 days. Index 55 is the 56th day (June 25)
    const resLast = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8 },
      '2026-06-25',
      null
    );
    expect(resLast?.weekNumber).toBe(8);
    expect(resLast?.percent).toBe(100);

    // Overflow/exact boundary day (June 26, 56 days elapsed)
    const resOverflow = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8 },
      '2026-06-26',
      null
    );
    expect(resOverflow?.weekNumber).toBe(8);
    expect(resOverflow?.percent).toBe(100);
  });
});
