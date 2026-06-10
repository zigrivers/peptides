// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WellbeingSentimentInsights } from './WellbeingSentimentInsights';

describe('WellbeingSentimentInsights', () => {
  it('renders touch-sized tab controls for mobile use', () => {
    render(
      <WellbeingSentimentInsights
        insights={{
          averageRating: 3.5,
          tagFrequencies: [],
          notesSummary: [],
          compoundCorrelations: [],
        }}
      />
    );

    for (const label of [
      'Overview',
      'Compound Correlations',
      'Tag Frequencies',
      'Recent Notes',
    ]) {
      const tab = screen.getByLabelText(label);
      expect(tab.className).toContain('min-h-9');
      expect(tab.className).toContain('min-w-9');
    }
  });
});
