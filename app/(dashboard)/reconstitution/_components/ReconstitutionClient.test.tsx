// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ReconstitutionClient } from './ReconstitutionClient';
import type { CompoundInventorySummary } from '@/lib/reconstitution/application/VialService';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  addDryVialsAction: vi.fn(),
  addReconstitutedVialAction: vi.fn(),
  reconstituteDryVialAction: vi.fn(),
  deleteVialAction: vi.fn(),
  updateVialRemainingMgAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/reorder-vials', () => ({
  reorderVialsAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/save-vial', () => ({
  saveVialAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn(),
}));

vi.mock('@/app/actions/reconstitution/set-active-vial', () => ({
  setActiveVialAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/reconstitution/domain/audioSynth', () => ({
  getAudioPlayer: () => ({
    playSwoosh: vi.fn(),
    playSwirlChime: vi.fn(),
    playNeedleSnap: vi.fn(),
  }),
}));

const summary: CompoundInventorySummary = {
  compoundId: 'c1',
  compoundName: 'BPC-157',
  compoundSlug: 'bpc-157',
  reconstitutedCount: 1,
  dryCount: 1,
  expiredCount: 0,
  totalReconstitutedRemainingMg: '14.000',
  totalDryMg: '10.000',
  worstBadge: null,
  activeVial: null,
  dryVialRefs: [{ id: 'd1', totalMg: '10.000', remainingMg: '10.000', expiresAt: null }],
  hasMixedConcentration: false,
  dosesLeft: null,
  unitsEach: null,
};

function renderClient(
  overrides: Partial<{
    userId: string;
    actorUserId: string;
    managedUsers: { id: string; name: string | null }[];
  }> = {}
) {
  return render(
    <ReconstitutionClient
      userId={overrides.userId ?? 'user-1'}
      actorUserId={overrides.actorUserId ?? 'user-1'}
      managedUsers={overrides.managedUsers ?? []}
      compounds={[{ id: 'c1', name: 'BPC-157', slug: 'bpc-157', profile: null }]}
      compoundsMinimal={[{ id: 'c1', name: 'BPC-157', slug: 'bpc-157' }]}
      dryVials={[]}
      activeVials={[]}
      inventorySummary={[summary]}
      reconstitutedVialsByCompound={{}}
      syringeStandard="U100"
      syringeSize="1.0"
    />
  );
}

beforeAll(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
});

describe('ReconstitutionClient view toggle', () => {
  afterEach(() => cleanup());

  it('defaults to By storage (shows the Refrigerator/Freezer sections)', () => {
    const { getByRole, queryByPlaceholderText } = renderClient();
    expect(getByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeTruthy();
    expect(getByRole('heading', { name: /Freezer \(Dry Vials\)/i })).toBeTruthy();
    // the by-compound search box is not rendered in storage mode
    expect(queryByPlaceholderText(/search compounds/i)).toBeNull();
  });

  it('switches to By compound and shows the compound inventory view', () => {
    const { getByRole, getByPlaceholderText, queryByRole } = renderClient();
    fireEvent.click(getByRole('button', { name: /by compound/i }));
    expect(getByPlaceholderText(/search compounds/i)).toBeTruthy();
    // the storage sections are hidden
    expect(queryByRole('heading', { name: /Refrigerator \(Active Vials\)/i })).toBeNull();
  });

  it('keeps the InventoryDashboard visible in both modes', () => {
    const { getByRole, container } = renderClient();
    const dashboardBefore = container.textContent;
    fireEvent.click(getByRole('button', { name: /by compound/i }));
    // dashboard add buttons remain available across the toggle
    expect(dashboardBefore).toBeTruthy();
    expect(container.textContent).toContain('By storage');
  });
});

describe('ReconstitutionClient caregiver subject selector', () => {
  afterEach(() => cleanup());

  it('does NOT render the subject selector when there are no managed users', () => {
    const { queryByLabelText } = renderClient({ managedUsers: [] });
    expect(queryByLabelText(/select whose inventory to view/i)).toBeNull();
  });

  it('renders the subject selector (self + managed users) when managed users exist', () => {
    const { getByLabelText, getByRole } = renderClient({
      actorUserId: 'user-1',
      userId: 'user-1',
      managedUsers: [{ id: 'managed-2', name: 'Alice' }],
    });
    const select = getByLabelText(/select whose inventory to view/i) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(getByRole('option', { name: /me \(self\)/i })).toBeTruthy();
    expect(getByRole('option', { name: 'Alice' })).toBeTruthy();
  });

  it('reflects the resolved subject (managed user) as the selected value', () => {
    const { getByLabelText } = renderClient({
      actorUserId: 'user-1',
      userId: 'managed-2',
      managedUsers: [{ id: 'managed-2', name: 'Alice' }],
    });
    const select = getByLabelText(/select whose inventory to view/i) as HTMLSelectElement;
    expect(select.value).toBe('managed-2');
  });
});
