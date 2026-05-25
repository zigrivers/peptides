// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { SyncIndicator } from './SyncIndicator';

const { mockRefresh, mockGetPending, mockMarkSynced } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockGetPending: vi.fn().mockResolvedValue([]),
  mockMarkSynced: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

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
    const { container } = render(<SyncIndicator />);
    
    // Check initially empty
    expect(container.firstChild).toBeNull();
  });

  it('renders offline indicator when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    mockGetPending.mockResolvedValue([]);
    
    render(<SyncIndicator />);
    
    expect(await screen.findByRole('status')).toBeDefined();
    expect(await screen.findByText('Offline')).toBeDefined();
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
    
    render(<SyncIndicator />);
    
    expect(await screen.findByText('1 pending (offline)')).toBeDefined();
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

    render(<SyncIndicator />);

    expect(await screen.findByText('Synced')).toBeDefined();
  });
});
