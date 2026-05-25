import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/app/actions/reconstitution/save-vial', () => ({
  saveVialAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn(),
}));

import { Compound } from '@/lib/reference/domain/types';
import { ReconstitutionCalculatorForm } from './ReconstitutionCalculatorForm';

describe('ReconstitutionCalculatorForm UI Warnings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockCompounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[] = [
    {
      id: 'c-1',
      name: 'BPC-157',
      slug: 'bpc-157',
      profile: {
        id: 'p-1',
        compoundId: 'c-1',
        reconstitutedShelfLifeDays: 14,
        dosingLow: { amount: '100', unit: 'mcg' },
        dosingTypical: { amount: '250', unit: 'mcg' },
        dosingHigh: { amount: '500', unit: 'mcg' },
        sideEffects: null,
        stackingNotes: null,
        citations: [],
      },
    },
  ];

  it('renders correctly and does not show warnings initially when fields are empty', () => {
    const html = renderToString(<ReconstitutionCalculatorForm compounds={mockCompounds} />);
    expect(html).toContain('Compound');
    expect(html).not.toContain('Calculation Results');
    expect(html).not.toContain('BAC water volume below 0.5 mL');
    expect(html).not.toContain('Injection volume exceeds 1.5 mL');
  });

  it('renders LOW_BAC_VOLUME warning in the UI when BAC water is below 0.5 mL', () => {
    const html = renderToString(
      <ReconstitutionCalculatorForm
        compounds={mockCompounds}
        initialCompoundId="c-1"
        initialTotalMg="5"
        initialBacWaterMl="0.4"
        initialTargetDoseMcg="250"
      />
    );
    expect(html).toContain('Calculation Results');
    expect(html).toContain('BAC water volume below 0.5 mL');
  });

  it('renders HIGH_VOLUME warning in the UI when calculated dose injection volume exceeds 1.5 mL', () => {
    // To get >1.5mL injection volume:
    // totalMg = 2mg, bacWaterMl = 10mL, targetDoseMcg = 400mcg
    // Concentration = 0.2 mg/mL = 200 mcg/mL. Dose of 400mcg requires 2.0 mL!
    const html = renderToString(
      <ReconstitutionCalculatorForm
        compounds={mockCompounds}
        initialCompoundId="c-1"
        initialTotalMg="2"
        initialBacWaterMl="10"
        initialTargetDoseMcg="400"
      />
    );
    expect(html).toContain('Calculation Results');
    expect(html).toContain('Injection volume exceeds 1.5 mL');
  });

  it('does not display warning banners for safe, standard inputs', () => {
    // standard BPC reconstitution: 5mg total, 2mL water, 250mcg target dose
    // Concentration = 2.5mg/mL = 2500mcg/mL. Dose of 250mcg = 0.1mL = 10 units. (Safe)
    const html = renderToString(
      <ReconstitutionCalculatorForm
        compounds={mockCompounds}
        initialCompoundId="c-1"
        initialTotalMg="5"
        initialBacWaterMl="2"
        initialTargetDoseMcg="250"
      />
    );
    expect(html).toContain('Calculation Results');
    expect(html).not.toContain('BAC water volume below 0.5 mL');
    expect(html).not.toContain('Injection volume exceeds 1.5 mL');
  });
});

