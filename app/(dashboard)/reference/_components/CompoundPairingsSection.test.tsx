import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompoundPairingsSection } from './CompoundPairingsSection';
import type { CompoundPairing } from '@/lib/reference/domain/types';

const pairings: CompoundPairing[] = [
  {
    id: 'pair-1',
    sourceCompoundId: 'bpc',
    pairedCompoundId: 'tb',
    pairedCompoundName: 'TB-500',
    pairedCompoundSlug: 'tb-500',
    benefitGoal: 'tissue repair',
    rationale: 'BPC-157 supports localized repair while TB-500 supports repair-cell migration.',
    expectedSynergy: 'Complementary repair signaling plus cell migration.',
    evidenceQuality: 'preclinical',
    safetyCaveats: 'No direct high-quality human combination trial found.',
    avoidIf: 'Active malignancy concern or pregnancy.',
    timingOrSequencingNotes: 'Render as a research note, not a dosing protocol.',
    bestOverall: true,
    partnerExistsInCatalog: true,
    missingCompoundAction: 'none',
    citationRefs: [
      {
        id: 'cit-1',
        catalogItemId: 'bpc',
        title: 'BPC-157 healing study',
        url: null,
        doi: '10.1234/bpc',
        pmid: '12345678',
      },
    ],
  },
];

describe('CompoundPairingsSection', () => {
  it('renders safety caveats before synergy and links in-catalog paired compounds', () => {
    const html = renderToString(<CompoundPairingsSection pairings={pairings} />);
    expect(html).toContain('Compound Pairings for Maximum Benefit');
    expect(html).toContain('href="/reference/tb-500"');
    expect(html.indexOf('Safety')).toBeLessThan(html.indexOf('Expected Synergy'));
    expect(html).toContain('No direct high-quality human combination trial found.');
    expect(html).toContain('BPC-157 healing study');
  });

  it('renders an empty state when no pairings are curated', () => {
    const html = renderToString(<CompoundPairingsSection pairings={[]} />);
    expect(html).toContain('No evidence-backed compound pairings are curated for this compound yet.');
  });

  it('renders an empty state when legacy fixtures omit pairings', () => {
    const html = renderToString(<CompoundPairingsSection />);
    expect(html).toContain('No evidence-backed compound pairings are curated for this compound yet.');
  });
});
