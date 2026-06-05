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

const mockOfflineEnqueue = vi.fn();

vi.mock('@/lib/offline/application/OfflineQueue', () => ({
  OfflineQueue: vi.fn().mockImplementation(() => ({
    enqueue: mockOfflineEnqueue,
  })),
}));

describe('DoseLogActions Component UI/UX with JSDOM', () => {
  const mockSiteData = {
    suggestion: { bodyPart: 'abdomen-upper', side: 'left' } as InjectionSite,
    validSites: [
      { bodyPart: 'abdomen-upper', side: 'left' },
      { bodyPart: 'abdomen-upper', side: 'right' },
    ] as InjectionSite[],
    siteMeta: [
      {
        site: { bodyPart: 'abdomen-upper', side: 'left' } as InjectionSite,
        lastUsed: null,
        daysSinceLastUse: null,
        isRested: true,
      },
      {
        site: { bodyPart: 'abdomen-upper', side: 'right' } as InjectionSite,
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
    
    // Left Upper Abdomen should be selected initially by default (indicated as Selected)
    const leftAbdomenHotspot = screen.getByLabelText('Left Upper Abdomen (Selected)');
    expect(leftAbdomenHotspot.getAttribute('aria-pressed')).toBe('true');

    // Click Right Upper Abdomen text button
    fireEvent.click(screen.getByText('Right Upper Abdomen'));

    // Right Upper Abdomen hotspot should now be selected, Left Upper Abdomen becomes suggested
    const rightAbdomenHotspot = screen.getByLabelText('Right Upper Abdomen (Selected)');
    expect(rightAbdomenHotspot.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Left Upper Abdomen (Suggested)').getAttribute('aria-pressed')).toBe('false');
  });

  it('supports Enter and Space keyboard activation on SVG hotspots', () => {
    render(<DoseLogActions {...defaultProps} />);
    
    // Initial selection is Left Upper Abdomen (Selected)
    expect(screen.getByLabelText('Left Upper Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');

    // Select Right Upper Abdomen hotspot via Space key
    const rightAbdomenHotspot = screen.getByLabelText('Right Upper Abdomen (Rested)');
    fireEvent.keyDown(rightAbdomenHotspot, { key: ' ' });

    expect(screen.getByLabelText('Right Upper Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');

    // Select Left Upper Abdomen hotspot back via Enter key
    const leftAbdomenHotspot = screen.getByLabelText('Left Upper Abdomen (Suggested)');
    fireEvent.keyDown(leftAbdomenHotspot, { key: 'Enter' });

    expect(screen.getByLabelText('Left Upper Abdomen (Selected)').getAttribute('aria-pressed')).toBe('true');
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
      injectionSite: { bodyPart: 'abdomen-upper', side: 'left' },
    });
  });

  it('renders rotation alert when selecting the same site as the last dose', () => {
    const conflictSiteData = {
      ...mockSiteData,
      recentSites: [{ bodyPart: 'abdomen-upper', side: 'left' } as InjectionSite],
    };
    render(<DoseLogActions {...defaultProps} siteData={conflictSiteData} />);

    // Since initial select (suggested) is Left Abdomen, it should immediately trigger conflict alert
    expect(screen.getByText(/Rotation Alert/)).toBeDefined();
    expect(screen.getByText(/This site was used for your last dose/)).toBeDefined();
  });

  it('does not render rotation alert when a different/rested site is selected', () => {
    const conflictSiteData = {
      ...mockSiteData,
      recentSites: [{ bodyPart: 'abdomen-upper', side: 'right' } as InjectionSite],
    };
    render(<DoseLogActions {...defaultProps} siteData={conflictSiteData} />);

    // Selected site is Left Abdomen, last used is Right Abdomen. No conflict alert.
    expect(screen.queryByText(/Rotation Alert/)).toBeNull();
  });

  describe('Offline Intercept Fallback Checks', () => {
    const originalOnLine = navigator.onLine;

    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine,
      });
      mockOfflineEnqueue.mockReset();
    });

    it('enqueues offline when browser is offline and navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      mockOfflineEnqueue.mockResolvedValueOnce({ ok: true, id: 'entry-id' });

      render(<DoseLogActions {...defaultProps} />);
      
      const logButton = screen.getByRole('button', { name: 'Log Dose' });
      fireEvent.click(logButton);

      // Verify "Pending Sync" badge shows up
      const badge = await screen.findByText('Pending Sync');
      expect(badge).toBeDefined();

      // Verify offline queue enqueued
      expect(mockOfflineEnqueue).toHaveBeenCalledWith(expect.objectContaining({
        protocolId: 'proto-1',
        amount: { amount: '250', unit: 'mcg' },
        status: 'LOGGED',
        injectionSite: { bodyPart: 'abdomen-upper', side: 'left' },
      }));
    });

    it('enqueues offline when a network TypeError occurs during online log attempt', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      const { logDoseAction } = await import('@/app/actions/tracker/log-dose');
      vi.mocked(logDoseAction).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      mockOfflineEnqueue.mockResolvedValueOnce({ ok: true, id: 'entry-id' });

      render(<DoseLogActions {...defaultProps} />);
      
      const logButton = screen.getByRole('button', { name: 'Log Dose' });
      fireEvent.click(logButton);

      // Verify offline queue enqueued
      const badge = await screen.findByText('Pending Sync');
      expect(badge).toBeDefined();
      expect(mockOfflineEnqueue).toHaveBeenCalled();
    });

    it('does not enqueue offline when an application error is returned from the server', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      const { logDoseAction } = await import('@/app/actions/tracker/log-dose');
      vi.mocked(logDoseAction).mockResolvedValueOnce({
        ok: false,
        error: 'invalid_injection_site',
        message: 'Invalid injection site for this protocol route.',
      });

      render(<DoseLogActions {...defaultProps} />);
      
      const logButton = screen.getByRole('button', { name: 'Log Dose' });
      fireEvent.click(logButton);

      // Verify error is shown but NOT queued offline
      const errorMsg = await screen.findByText('Invalid injection site for this protocol route.');
      expect(errorMsg).toBeDefined();
      expect(mockOfflineEnqueue).not.toHaveBeenCalled();
    });
  });
});
