import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// The reconstitution page is a server component whose JSX return relies on the classic
// React runtime being in scope; provide it globally for this isolated render.
(globalThis as unknown as { React: typeof React }).React = React;

// ── Mocks for every dependency the reconstitution page pulls in ──────────────
const h = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRedirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockGetVialsForUser: vi.fn(async () => []),
  mockGetDryVialsForUser: vi.fn(async () => []),
  mockGetInventorySummary: vi.fn(async () => []),
  mockListProtocolsForUser: vi.fn(async () => []),
}));
const {
  mockAuth,
  mockRedirect,
  mockUserFindMany,
  mockUserFindUnique,
  mockGetVialsForUser,
  mockGetDryVialsForUser,
  mockGetInventorySummary,
  mockListProtocolsForUser,
} = h;

vi.mock('@/lib/auth', () => ({ auth: h.mockAuth }));
vi.mock('next/navigation', () => ({ redirect: h.mockRedirect }));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: {
      findMany: h.mockUserFindMany,
      findUnique: h.mockUserFindUnique,
    },
  },
}));
vi.mock('@/lib/reference/infrastructure/CompoundRepo', () => ({
  listCompounds: vi.fn(async () => []),
}));
vi.mock('@/lib/reconstitution/application/VialService', () => ({
  getVialsForUser: h.mockGetVialsForUser,
  getDryVialsForUser: h.mockGetDryVialsForUser,
  getInventorySummaryByCompound: h.mockGetInventorySummary,
  serializeVial: vi.fn((v: unknown) => v),
}));
vi.mock('@/lib/tracker/infrastructure/ProtocolRepo', () => ({
  listProtocolsForUser: h.mockListProtocolsForUser,
}));

// Render the client to a no-op to avoid pulling the full component tree.
vi.mock('@/app/(dashboard)/reconstitution/_components/ReconstitutionClient', () => ({
  ReconstitutionClient: () => null,
}));

import ReconstitutionPage from '@/app/(dashboard)/reconstitution/page';

const ACTOR = 'actor-1';
const MANAGED = 'managed-2';
const STRANGER = 'stranger-9';

function makeProps(subject?: string) {
  return {
    searchParams: Promise.resolve(subject ? { subject } : {}),
  };
}

describe('US-REC: reconstitution page subject scoping (caregiver inventory)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ syringeStandard: 'U100', syringeSize: '1.0' });
    mockUserFindMany.mockResolvedValue([{ id: MANAGED, name: 'Alice' }]);
  });

  it('defaults the subject to the actor when no ?subject param is present', async () => {
    mockAuth.mockResolvedValue({ user: { id: ACTOR, role: 'POWER_USER' } });

    await ReconstitutionPage(makeProps());

    expect(mockGetVialsForUser).toHaveBeenCalledWith(ACTOR);
    expect(mockGetDryVialsForUser).toHaveBeenCalledWith(ACTOR);
    expect(mockListProtocolsForUser).toHaveBeenCalledWith(expect.anything(), ACTOR);
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ACTOR } })
    );
    expect(mockGetInventorySummary).toHaveBeenCalledWith(ACTOR, expect.anything(), 'U100');
  });

  it('scopes EVERY query to the managed subject when the actor manages ?subject', async () => {
    mockAuth.mockResolvedValue({ user: { id: ACTOR, role: 'POWER_USER' } });

    await ReconstitutionPage(makeProps(MANAGED));

    expect(mockGetVialsForUser).toHaveBeenCalledWith(MANAGED);
    expect(mockGetDryVialsForUser).toHaveBeenCalledWith(MANAGED);
    expect(mockListProtocolsForUser).toHaveBeenCalledWith(expect.anything(), MANAGED);
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MANAGED } })
    );
    expect(mockGetInventorySummary).toHaveBeenCalledWith(MANAGED, expect.anything(), 'U100');

    // Never leaks the actor's own data fetch when a managed subject is selected.
    expect(mockGetVialsForUser).not.toHaveBeenCalledWith(ACTOR);
  });

  it('falls back to the actor (no leak) when ?subject is a user the actor does NOT manage', async () => {
    mockAuth.mockResolvedValue({ user: { id: ACTOR, role: 'POWER_USER' } });

    await ReconstitutionPage(makeProps(STRANGER));

    expect(mockGetVialsForUser).toHaveBeenCalledWith(ACTOR);
    expect(mockGetVialsForUser).not.toHaveBeenCalledWith(STRANGER);
    expect(mockGetInventorySummary).not.toHaveBeenCalledWith(
      STRANGER,
      expect.anything(),
      expect.anything()
    );
  });

  it('does NOT query managed users (and ignores ?subject) for a non-power-user', async () => {
    mockAuth.mockResolvedValue({ user: { id: ACTOR, role: 'MANAGED_USER' } });

    await ReconstitutionPage(makeProps(MANAGED));

    // No managed-user lookup performed; subject collapses to the actor.
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockGetVialsForUser).toHaveBeenCalledWith(ACTOR);
    expect(mockGetVialsForUser).not.toHaveBeenCalledWith(MANAGED);
  });

  it('redirects to /login when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(ReconstitutionPage(makeProps())).rejects.toThrow('REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
