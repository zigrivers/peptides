import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/app/actions/reconstitution/reorder-vials', () => ({
  reorderVialsAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  deleteVialAction: vi.fn(),
  addDryVialsAction: vi.fn(),
  reconstituteDryVialAction: vi.fn(),
  addReconstitutedVialAction: vi.fn(),
}));

import { VialInventory, type SerializedVial } from './VialInventory';

describe('VialInventory Component UI/UX', () => {
  const baseVial: SerializedVial = {
    id: 'vial-1',
    compoundId: 'comp-1',
    compoundName: 'BPC-157',
    compoundSlug: 'bpc-157',
    totalMg: '5.000',
    bacWaterMl: '2.000',
    remainingMg: '5.000',
    status: 'RECONSTITUTED',
    reconstitutedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), // 5 days ago
    expiresAt: new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString(), // 9 days left (total 14 days)
    daysUntilExpiry: 9,
    badges: [],
  };

  it('renders standard active vial without blur or cloudiness when freshly reconstituted', () => {
    // freshly reconstituted (elapsed = 0)
    const freshVial: SerializedVial = {
      ...baseVial,
      reconstitutedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      daysUntilExpiry: 14,
    };

    const html = renderToString(<VialInventory vials={[freshVial]} />);
    // Filter style should be 'none' since ageFactor = 0 <= 0.3
    expect(html).toContain('filter:none');
  });

  it('applies progressive CSS blur and grayscale filters as vial ages past 30%', () => {
    // 80% aged (elapsed = 8 days, total = 10 days) -> ageFactor = 0.8
    // ageFactor = 0.8 > 0.3 -> blurAmount = (0.8 - 0.3) * 3 = 1.5px
    // grayscaleAmount = (0.8 - 0.3) * 100 = 50%
    const agedVial: SerializedVial = {
      ...baseVial,
      reconstitutedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      daysUntilExpiry: 2,
    };

    const html = renderToString(<VialInventory vials={[agedVial]} />);
    // Check if it renders the progressive blur style
    expect(html).toContain('filter:blur(1.5px) grayscale(50%)');
  });

  it('caps the ageFactor filter style at 1.2 to prevent excessive blur', () => {
    // 150% aged (elapsed = 15 days, total = 10 days) -> ageFactor = 1.5 -> displayAgeFactor = Math.min(1.5, 1.2) = 1.2
    // blurAmount = (1.2 - 0.3) * 3 = 2.7px
    // grayscaleAmount = (1.2 - 0.3) * 100 = 90%
    const severelyAgedVial: SerializedVial = {
      ...baseVial,
      reconstitutedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      daysUntilExpiry: -5,
    };

    const html = renderToString(<VialInventory vials={[severelyAgedVial]} />);
    expect(html).toContain('filter:blur(2.7px) grayscale(90%)');
  });

  it('renders "Expired (Override)" badge when expiry date is on or before reconstitution date', () => {
    const overrideVial: SerializedVial = {
      ...baseVial,
      reconstitutedAt: new Date('2026-05-24T12:00:00Z').toISOString(),
      expiresAt: new Date('2026-05-24T12:00:00Z').toISOString(),
      daysUntilExpiry: 0,
    };

    const html = renderToString(<VialInventory vials={[overrideVial]} />);
    expect(html).toContain('Expired (Override)');
  });
});
