import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DosingGuidanceRanges, ProtocolSummaryGrid } from './DosingGuidanceRanges';

describe('DosingGuidanceRanges', () => {
  it('renders dose ranges with frequency and benefit guidance', () => {
    const html = renderToString(
      <DosingGuidanceRanges
        ranges={{
          low: {
            amount: '250',
            unit: 'mcg',
            recommendedFrequency: 'Once daily',
            researchBenefits: 'Mild recovery support',
          },
          typical: {
            amount: '500',
            unit: 'mcg',
            recommendedFrequency: 'Once or twice daily',
            researchBenefits: 'Standard tendon, muscle, and gut barrier healing',
          },
          high: {
            amount: '1000',
            unit: 'mcg',
            recommendedFrequency: 'Twice daily',
            researchBenefits: 'Accelerated healing for severe ligament tears',
          },
        }}
      />
    );

    expect(html).toContain('Dosing Guidance Ranges');
    expect(html).toContain('Conservative');
    expect(html).toContain('Typical Range');
    expect(html).toContain('Aggressive');
    expect(html).toContain('250');
    expect(html).toContain('mcg');
    expect(html).toContain('Once or twice daily');
    expect(html).toContain('Standard tendon, muscle, and gut barrier healing');
  });

  it('keeps missing optional copy from creating empty labels', () => {
    const html = renderToString(
      <DosingGuidanceRanges
        ranges={{
          low: { amount: '1', unit: 'mg' },
          typical: { amount: '2', unit: 'mg', recommendedFrequency: 'Daily' },
          high: { amount: '3', unit: 'mg' },
        }}
      />
    );

    expect(html).toContain('Daily');
    expect(html).not.toContain('Benefits:</span></p>');
    expect(html).not.toContain('Frequency:</span></p>');
  });
});

describe('ProtocolSummaryGrid', () => {
  it('renders a compact protocol summary for dense Catalog scanning', () => {
    const html = renderToString(
      <ProtocolSummaryGrid
        cycleLabel="8 Weeks"
        restLabel="4 Weeks Washout"
        scheduleLabel="2x Daily: 5 Days On / 2 Off"
        preferredTimeLabel="Morning and Night"
        routes={['SubQ', 'IM']}
      />
    );

    expect(html).toContain('Protocol Snapshot');
    expect(html).toContain('8 Weeks');
    expect(html).toContain('4 Weeks Washout');
    expect(html).toContain('2x Daily: 5 Days On / 2 Off');
    expect(html).toContain('Morning and Night');
    expect(html).toContain('SubQ');
    expect(html).toContain('IM');
  });
});
