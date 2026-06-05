import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompoundAdjunctsSection } from './CompoundAdjunctsSection';
import type { CompoundAdjunctRecommendation } from '@/lib/reference/domain/types';

const adjuncts: CompoundAdjunctRecommendation[] = [
  {
    id: 'adjrec-1',
    sourceCompoundId: 'semaglutide',
    adjunctId: 'hydration',
    adjunctName: 'Hydration and Electrolyte Support',
    adjunctSlug: 'hydration-and-electrolyte-support',
    adjunctCategory: 'SAFETY_MITIGATION',
    adjunctDescription: 'Structured hydration habits and electrolyte replacement when intake is reduced.',
    adjunctEvidenceSummary: 'GLP-1 labels and GI guidance support monitoring hydration and constipation risk.',
    adjunctSafetyNotes: 'Avoid aggressive electrolyte loading when fluids or electrolytes are medically restricted.',
    benefitGoal: 'GI tolerability and hydration support',
    rationale: 'Reduced appetite and slowed GI transit can lower fluid intake and increase constipation risk.',
    expectedBenefit: 'Supports hydration habits and constipation prevention without adding another compound.',
    evidenceQuality: 'human_limited',
    safetyCategory: 'SAFETY_MITIGATION',
    safetyCaveats: 'Escalating GI symptoms, persistent vomiting, or suspected dehydration require clinician review.',
    avoidIf: 'Fluid restriction, severe kidney disease, or clinician-directed electrolyte restrictions.',
    implementationNotes: 'Supportive context only; not a peptide dose recommendation.',
    citationRefs: [
      {
        id: 'adjcit-1',
        adjunctId: 'hydration',
        title: 'Treatment for Constipation - NIDDK',
        url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/treatment',
        doi: null,
        pmid: null,
      },
    ],
  },
];

describe('CompoundAdjunctsSection', () => {
  it('renders safety information before rationale and benefit content', () => {
    const html = renderToString(<CompoundAdjunctsSection adjuncts={adjuncts} />);
    expect(html).toContain('Supportive Adjuncts and Monitoring');
    expect(html).toContain('Hydration and Electrolyte Support');
    expect(html).toContain('Safety Mitigation');
    expect(html.indexOf('Safety')).toBeLessThan(html.indexOf('Rationale'));
    expect(html.indexOf('Safety')).toBeLessThan(html.indexOf('Expected Benefit'));
    expect(html).toContain('not a peptide dose recommendation');
    expect(html).toContain('Treatment for Constipation - NIDDK');
  });

  it('renders an empty state when no adjuncts are curated', () => {
    const html = renderToString(<CompoundAdjunctsSection adjuncts={[]} />);
    expect(html).toContain('No supportive adjuncts or monitoring supports are curated for this compound yet.');
  });

  it('renders an empty state when legacy fixtures omit adjuncts', () => {
    const html = renderToString(<CompoundAdjunctsSection />);
    expect(html).toContain('No supportive adjuncts or monitoring supports are curated for this compound yet.');
  });
});
