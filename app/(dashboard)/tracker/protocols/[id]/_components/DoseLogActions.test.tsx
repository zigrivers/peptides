// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DoseLogActions } from './DoseLogActions';
import type { InjectionSite } from '@/lib/tracker/domain/types';

// Mock server actions to verify triggers
vi.mock('@/app/actions/tracker/log-dose', () => ({
  logDoseAction: vi.fn(() =>
    Promise.resolve({
      ok: true,
      doseLog: { status: 'LOGGED' },
      warnings: [],
    })
  ),
}));

describe('DoseLogActions Component UI/UX with JSDOM', () => {
  const mockSiteData = {
    suggestion: { bodyPart: 'abdomen', side: 'left' } as InjectionSite,
    validSites: [
      { bodyPart: 'abdomen', side: 'left' },
      { bodyPart: 'abdomen', side: 'right' },
    ] as InjectionSite[],
    siteMeta: [
      {
        site: { bodyPart: 'abdomen', side: 'left' } as InjectionSite,
        lastUsed: null,
        daysSinceLastUse: null,
        isRested: true,
      },
      {
        site: { bodyPart: 'abdomen', side: 'right' } as InjectionSite,
        lastUsed: null,
        daysSinceLastUse: null,
        isRested: true,
      },
    ],
    recentSites: [] as InjectionSite[],
  };

  const defaultProps = {
    protocolId: 'proto-1',
    amount: { amount: '250', unit: 'mcg' as const },
    siteData: mockSiteData,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the interactive SVG body map and mirror labels', () => {
    render(<DoseLogActions {...defaultProps} />);
    
    // Check visual map container and labels
    expect(screen.getByText('VISUAL MAP')).toBeDefined();
    expect(screen.getByText('R (Right)')).toBeDefined();
    expect(screen.getByText('L (Left)')).toBeDefined();
    expect(screen.getByLabelText('Injection site body map')).toBeDefined();
  });

  it('allows selecting a site via SVG hotspots and text buttons', () => {
    render(<DoseLogActions {...defaultProps} />);
    
    // Left Abdomen should be selected initially by default (indicated as Selected)
    const leftAbdomenHotspot = screen.getByLabelText('Left Abdomen (Selected)');
    expect(leftAbdomenHotspot.getAttribute('aria-pressed')).toBe('true');

    // Click Right Abdomen text button
    fireEvent.click(screen.getByText('Right Abdomen'));

    // Right Abdomen hotspot should now be selected, Left Abdomen becomes suggested
    const rightAbdomenHotspot = screen.getByLabelText('Right Abdomen (Selected)');
    expect(rightAbdomenHotspot.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Left Abdomen (Suggested)').getAttribute('aria-pressed')).toBe('false');
  });

  it('supports Enter and Space keyboard activation on SVG hotspots', () => {
    render(<DoseLogActions {...defaultProps} />);
    
    // Initial selection is Left Abdomen (Selected)
    expect(screen.getByLabelText('Left Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');

    // Select Right Abdomen hotspot via Space key
    const rightAbdomenHotspot = screen.getByLabelText('Right Abdomen (Rested)');
    fireEvent.keyDown(rightAbdomenHotspot, { key: ' ' });

    expect(screen.getByLabelText('Right Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');

    // Select Left Abdomen hotspot back via Enter key
    const leftAbdomenHotspot = screen.getByLabelText('Left Abdomen (Suggested)');
    fireEvent.keyDown(leftAbdomenHotspot, { key: 'Enter' });

    expect(screen.getByLabelText('Left Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');
  });

  it('enables the Log Dose button and triggers logDoseAction on click', async () => {
    const { logDoseAction } = await import('@/app/actions/tracker/log-dose');
    
    render(<DoseLogActions {...defaultProps} />);
    
    // Click "Log Dose" button
    const logButton = screen.getByRole('button', { name: 'Log Dose' });
    fireEvent.click(logButton);

    // Verify server action was called
    expect(logDoseAction).toHaveBeenCalledWith({
      protocolId: 'proto-1',
      amount: { amount: '250', unit: 'mcg' },
      status: 'LOGGED',
      injectionSite: { bodyPart: 'abdomen', side: 'left' },
    });
  });
});
