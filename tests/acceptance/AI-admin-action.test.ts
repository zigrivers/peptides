/**
 * Task 5.4 — Admin draft-profile server action access control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockDraftProfile = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/ai/application/draftCompoundProfile', () => ({
  draftCompoundProfile: mockDraftProfile,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const { draftProfileAction } = await import('@/app/actions/admin/draft-profile');

describe('draftProfileAction', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: [] });
    expect(result.error).toBe('unauthorized');
    expect(mockDraftProfile).not.toHaveBeenCalled();
  });

  it('returns forbidden for MANAGED_USER', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'MANAGED_USER' } });
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: [] });
    expect(result.error).toBe('forbidden');
    expect(mockDraftProfile).not.toHaveBeenCalled();
  });

  it('returns forbidden for any future non-POWER_USER role (positive gate)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'UNKNOWN_FUTURE_ROLE' } });
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: [] });
    expect(result.error).toBe('forbidden');
    expect(mockDraftProfile).not.toHaveBeenCalled();
  });

  it('forwards to draftCompoundProfile for POWER_USER and returns the draft', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'POWER_USER' } });
    mockDraftProfile.mockResolvedValueOnce({ draft: '## Overview\nContent here.' });
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: ['cite1'] });
    expect(result.draft).toContain('## Overview');
    expect(mockDraftProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        compoundName: 'BPC-157',
        citations: ['cite1'],
        actorUserId: 'u1',
      })
    );
  });

  it('maps ai_unavailable to a structured error so the admin can fall back to manual entry', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'POWER_USER' } });
    mockDraftProfile.mockRejectedValueOnce(new Error('ai_unavailable'));
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: [] });
    expect(result.error).toBe('ai_unavailable');
    expect(result.draft).toBeUndefined();
  });

  it('maps disallowed_output to its own error', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'POWER_USER' } });
    mockDraftProfile.mockRejectedValueOnce(new Error('disallowed_output'));
    const result = await draftProfileAction({ compoundName: 'BPC-157', citations: [] });
    expect(result.error).toBe('disallowed_output');
  });
});
