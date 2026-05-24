// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SyncIndicator } from './SyncIndicator';

const mockGetPending = vi.fn().mockResolvedValue([]);
const mockMarkSynced = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/offline/application/OfflineQueue', () => {
  return {
    OfflineQueue: class {
      getPending = mockGetPending;
      markSynced = mockMarkSynced;
    }
  };
});

describe('SyncIndicator Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetPending.mockReset();
    mockMarkSynced.mockReset();
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing when idle and pending count is 0', async () => {
    mockGetPending.mockResolvedValue([]);
    let container: HTMLElement;
    await act(async () => {
      const rendered = render(<SyncIndicator />);
      container = rendered.container;
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container!.firstChild).toBeNull();
  });

  it('renders offline indicator when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    mockGetPending.mockResolvedValue([]);
    
    await act(async () => {
      render(<SyncIndicator />);
      await new Promise((r) => setTimeout(r, 50));
    });
    
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Offline')).toBeDefined();
  });

  it('renders pending count when offline and entries are in queue', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    mockGetPending.mockResolvedValue([
      {
        id: '1',
        protocolId: 'p1',
        scheduledDate: '2026-05-24',
        deviceId: 'd1',
        synced: false,
        queuedAt: Date.now(),
        status: 'LOGGED',
      },
    ]);
    
    await act(async () => {
      render(<SyncIndicator />);
      await new Promise((r) => setTimeout(r, 100));
    });
    
    expect(screen.getByText('1 pending (offline)')).toBeDefined();
  });

  it('renders syncing and success checkmark synced states when online and pending items sync successfully', async () => {
    mockGetPending
      .mockResolvedValueOnce([
        {
          id: '1',
          protocolId: 'p1',
          scheduledDate: '2026-05-24',
          deviceId: 'd1',
          synced: false,
          queuedAt: Date.now(),
          status: 'LOGGED',
        },
      ]) // initial checkPending
      .mockResolvedValueOnce([
        {
          id: '1',
          protocolId: 'p1',
          scheduledDate: '2026-05-24',
          deviceId: 'd1',
          synced: false,
          queuedAt: Date.now(),
          status: 'LOGGED',
        },
      ]) // fetch loop check
      .mockResolvedValueOnce([]); // post-sync check (0 remaining)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ id: '1', ok: true }] }),
    }));

    await act(async () => {
      render(<SyncIndicator />);
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(screen.getByText('Synced')).toBeDefined();
  });
});
