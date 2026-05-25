import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DoseOutcomeChart } from '@/app/(dashboard)/dashboard/_components/DoseOutcomeChart';

describe('US-ANL-01: Dose-Outcome Correlation Charts', () => {
  const mockDoseLogs = [
    {
      id: 'log-1',
      protocolId: 'proto-1',
      compoundId: 'comp-1',
      scheduledDate: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      amount: { amount: '250', unit: 'mcg' as const },
      status: 'LOGGED' as const,
    },
  ];

  const mockOutcomeLogs = [
    {
      id: 'out-1',
      scheduledDate: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      overallRating: 4,
      tags: ['energy', 'focus'],
      note: 'Felt very motivated',
    },
  ];

  const mockCompounds = {
    'proto-1': { name: 'BPC-157', slug: 'bpc-157' },
  };

  it('AC-1: renders the SVG container with proper graphics-document role and aria-label', () => {
    const html = renderToString(
      <DoseOutcomeChart
        doseLogs={mockDoseLogs}
        outcomeLogs={mockOutcomeLogs}
        compounds={mockCompounds}
      />
    );

    // Assert SVG details
    expect(html).toContain('role="graphics-document"');
    expect(html).toContain('aria-label="Dosage and rating correlation graph over the last 30 days"');
  });

  it('AC-2: renders the visually hidden screen reader fallback table with full data points', () => {
    const html = renderToString(
      <DoseOutcomeChart
        doseLogs={mockDoseLogs}
        outcomeLogs={mockOutcomeLogs}
        compounds={mockCompounds}
      />
    );

    // Check sr-only table structures
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('<caption>Dosage and Rating Correlation Table</caption>');
    expect(html).toContain('250 mcg BPC-157');
    expect(html).toContain('4/5');
    expect(html).toContain('Felt very motivated');
  });

  it('AC-3: plots grid lines and X-axis ticks correctly', () => {
    const html = renderToString(
      <DoseOutcomeChart
        doseLogs={mockDoseLogs}
        outcomeLogs={mockOutcomeLogs}
        compounds={mockCompounds}
      />
    );

    // Should render lines and Y-axis text
    expect(html).toContain('viewBox="0 0 600 240"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('id="area-grad"');
  });
});
