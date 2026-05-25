// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DoseOutcomeChart } from './DoseOutcomeChart';

describe('DoseOutcomeChart Component Interactive clicks', () => {
  afterEach(() => {
    cleanup();
  });

  const mockDoseLogs = [
    {
      id: 'log-1',
      protocolId: 'proto-1',
      compoundId: 'comp-1',
      scheduledDate: '2026-05-20T00:00:00.000Z',
      amount: { amount: '250', unit: 'mcg' as const },
      status: 'LOGGED' as const,
    },
  ];

  const mockOutcomeLogs = [
    {
      id: 'out-1',
      scheduledDate: '2026-05-20T00:00:00.000Z',
      overallRating: 4,
      tags: ['energy'],
      note: 'Good day',
    },
  ];

  const mockCompounds = {
    'proto-1': { name: 'BPC-157', slug: 'bpc-157' },
  };

  it('triggers onSelectDate callback when clicking on an outcome dot', () => {
    const handleSelectDate = vi.fn();

    render(
      <DoseOutcomeChart
        doseLogs={mockDoseLogs}
        outcomeLogs={mockOutcomeLogs}
        compounds={mockCompounds}
        referenceDate="2026-05-24"
        onSelectDate={handleSelectDate}
      />
    );

    const dots = document.querySelectorAll('circle.cursor-pointer');
    expect(dots.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(dots[0]);

    expect(handleSelectDate).toHaveBeenCalledWith('2026-05-20');
  });

  it('triggers onSelectDate callback when clicking a tab-bar rectangle', () => {
    const handleSelectDate = vi.fn();

    render(
      <DoseOutcomeChart
        doseLogs={mockDoseLogs}
        outcomeLogs={mockOutcomeLogs}
        compounds={mockCompounds}
        referenceDate="2026-05-24"
        onSelectDate={handleSelectDate}
      />
    );

    const tabRects = screen.getAllByRole('button');
    expect(tabRects.length).toBe(30); // 30 days lookback

    // Find the one corresponding to the date with data, or just click one
    fireEvent.click(tabRects[25]);

    expect(handleSelectDate).toHaveBeenCalled();
  });
});
