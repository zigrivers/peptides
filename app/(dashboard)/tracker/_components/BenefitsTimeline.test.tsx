// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BenefitsTimeline } from './BenefitsTimeline';
import { toggleObservedBenefitAction } from '@/app/actions/tracker/toggle-observed-benefit';

// Mock the server action to prevent next-auth/next/server loading errors
vi.mock('@/app/actions/tracker/toggle-observed-benefit', () => ({
  toggleObservedBenefitAction: vi.fn(),
}));

describe('BenefitsTimeline Component UI/UX with JSDOM', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mockActiveProtocols = [
    {
      id: 'proto-1',
      userId: 'user-1',
      compoundId: 'compound-tirz',
      cycleId: null,
      dose: { amount: '2.5', unit: 'mg' as const },
      schedule: { frequency: 'Daily' as const },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE' as const,
      startDate: '2026-05-18T00:00:00.000Z', // Started 7 days ago, so Day 7 = Week 2 starts today
      endDate: null,
      notes: null,
      observedBenefits: ['1:Initial glycemic improvements'],
      compound: {
        name: 'Tirzepatide',
        slug: 'tirzepatide',
        profile: {
          benefitTimeline: [
            { week: 1, benefits: ['Initial glycemic improvements', 'Appetite suppression starts'] },
            { week: 2, benefits: ['Noticeable weight reduction benefits', 'Steady state concentration'] },
            { week: 4, benefits: ['Metabolic optimization'] },
          ],
        },
      },
    },
    {
      id: 'proto-2',
      userId: 'user-1',
      compoundId: 'compound-bpc',
      cycleId: null,
      dose: { amount: '250', unit: 'mcg' as const },
      schedule: { frequency: 'Daily' as const },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE' as const,
      startDate: '2026-05-25T00:00:00.000Z', // Started today, Day 0 = Week 1
      endDate: null,
      notes: null,
      observedBenefits: [],
      compound: {
        name: 'BPC-157',
        slug: 'bpc-157',
        profile: {
          benefitTimeline: [
            { week: 1, benefits: ['GI barrier support', 'Reduced muscle soreness'] },
            { week: 2, benefits: ['Joint mobility improvement'] },
            { week: 4, benefits: ['Soft tissue healing'] },
          ],
        },
      },
    },
    {
      id: 'proto-3',
      userId: 'user-1',
      compoundId: 'compound-tb',
      cycleId: null,
      dose: { amount: '2', unit: 'mg' as const },
      schedule: { frequency: 'Daily' as const },
      administrationRoute: 'SUBCUTANEOUS',
      status: 'ACTIVE' as const,
      startDate: '2026-05-11T00:00:00.000Z', // Started 14 days ago, so Day 14 = Week 3 starts today (no Week 3 in DB timeline)
      endDate: null,
      notes: null,
      observedBenefits: [],
      compound: {
        name: 'TB-500',
        slug: 'tb-500',
        profile: {
          benefitTimeline: [
            { week: 1, benefits: ['Inflammation reduction'] },
            { week: 2, benefits: ['Flexibility improvement'] },
            { week: 4, benefits: ['Tissue repair'] },
          ],
        },
      },
    },
  ];

  it('renders a compact benefits preview instead of a full vertical timeline', () => {
    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    expect(screen.getByRole('heading', { name: 'What To Expect Next' })).toBeDefined();
    expect(screen.getByText('Compact preview from active regimens.')).toBeDefined();

    // Current phases and next milestones should be visible at a glance.
    expect(screen.getByText('Tirzepatide')).toBeDefined();
    expect(screen.getAllByText('BPC-157').length).toBeGreaterThan(0);
    expect(screen.getByText('TB-500')).toBeDefined();
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Starts in 7 days').length).toBeGreaterThan(0);

    // The old component rendered every milestone as a long timeline.
    expect(screen.queryByText('Week 1 Milestone')).toBeNull();
    expect(screen.queryByText('Week 4 Milestone')).toBeNull();
  });

  it('keeps full benefit review available behind a details disclosure', () => {
    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    expect(screen.getByText('Review observed benefits')).toBeDefined();

    const disclosure = screen.getByText('Review observed benefits');
    fireEvent.click(disclosure);

    // Experienced and current items remain available for benefit observation tracking,
    // but they no longer dominate the default Tracker view.
    expect(screen.getAllByText('Experienced').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Flexibility improvement').length).toBeGreaterThan(0);
  });

  it('allows checking an observed benefit and updates state optimistically, then handles success', async () => {
    const mockAction = vi.mocked(toggleObservedBenefitAction);
    mockAction.mockResolvedValue({
      ok: true,
      observedBenefits: ['1:GI barrier support'],
    });

    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    // Find the GI barrier support benefit checkbox (Week 1, BPC-157)
    const giCheckbox = screen.getByText('GI barrier support');
    expect(giCheckbox).toBeDefined();

    // Click it
    fireEvent.click(giCheckbox);

    // Verify it calls toggleObservedBenefitAction
    expect(mockAction).toHaveBeenCalledWith({
      protocolId: 'proto-2',
      week: 1,
      benefitText: 'GI barrier support',
    });
  });

  it('rolls back state and alerts user when server action returns ok = false', async () => {
    const mockAction = vi.mocked(toggleObservedBenefitAction);
    mockAction.mockResolvedValue({
      ok: false,
      error: 'unauthorized',
      message: 'You are not authorized to update this protocol.',
    });

    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    const giCheckbox = screen.getByText('GI barrier support');
    fireEvent.click(giCheckbox);

    // Assert that the inline error banner is rendered with correct message
    const errorBanner = await screen.findByText('You are not authorized to update this protocol.');
    expect(errorBanner).toBeDefined();
  });

  it('rolls back state and alerts user when server action throws an error', async () => {
    const mockAction = vi.mocked(toggleObservedBenefitAction);
    mockAction.mockRejectedValue(new Error('Network failure'));

    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    const giCheckbox = screen.getByText('GI barrier support');
    fireEvent.click(giCheckbox);

    // Assert that the inline error banner is rendered with correct message
    const errorBanner = await screen.findByText('A network error occurred. Please try again.');
    expect(errorBanner).toBeDefined();
  });
});
