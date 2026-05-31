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

  it('renders unified benefits timeline grouped by sorted weeks', () => {
    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    // Verify milestones are present, including Week 3 which is dynamically added due to TB-500
    expect(screen.getByText('Week 1 Milestone')).toBeDefined();
    expect(screen.getByText('Week 2 Milestone')).toBeDefined();
    expect(screen.getByText('Week 3 Milestone')).toBeDefined();
    expect(screen.getByText('Week 4 Milestone')).toBeDefined();
  });

  it('calculates compound-specific status and countdowns correctly', () => {
    render(
      <BenefitsTimeline
        activeProtocols={mockActiveProtocols}
        currentDateISO="2026-05-25T12:00:00.000Z"
      />
    );

    // Tirzepatide started on May 18 (elapsed weeks is 2).
    // BPC-157 started on May 25 (elapsed weeks is 1).
    // TB-500 started on May 11 (elapsed weeks is 3).

    // Let's verify statuses of Tirzepatide & TB-500
    const experiencedBadges = screen.getAllByText('Experienced');
    expect(experiencedBadges.length).toBeGreaterThan(0);

    // Week 3 TB-500 (Current Phase), Week 2 Tirzepatide (Current Phase), Week 1 BPC-157 (Current Phase)
    const currentPhaseBadges = screen.getAllByText('Current Phase');
    expect(currentPhaseBadges.length).toBe(6);

    // BPC-157 Week 2 milestone countdown:
    // Started May 25. Week 2 starts June 1. Diff is 7 days.
    // Also TB-500 Week 4 starts June 1. Diff is 7 days.
    expect(screen.getAllByText('Starts in 7 days').length).toBe(2);

    // TB-500 Week 3 displays the ongoing benefits of Week 2:
    expect(screen.getByText('Ongoing from Week 2 milestone')).toBeDefined();
    expect(screen.getAllByText('Flexibility improvement').length).toBe(2);

    // Tirzepatide Week 4: starts June 8 (14 days from May 25). Displays "Starts in 2 weeks".
    expect(screen.getByText('Starts in 2 weeks')).toBeDefined();

    // BPC-157 Week 4: starts June 15 (21 days from May 25). Displays "Starts in 3 weeks".
    expect(screen.getByText('Starts in 3 weeks')).toBeDefined();
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
