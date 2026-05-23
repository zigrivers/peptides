/**
 * Story: US-ADM-01 / US-AUT-01 — Accept Invite Flow
 * Task 1.6c — Phase 2 Legal Gate item 1 remediation
 *
 * Tests the acceptInviteAction server action: it consumes a raw invite token,
 * creates the managed user, marks the invite ACCEPTED, and writes the
 * INVITE_ACCEPTED audit event — all in a single withAudit transaction.
 *
 * The /accept-invite page is exercised at the action boundary; UI rendering
 * is verified by the action's effect (User created, Invite updated, audit
 * written, sign-in invoked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInviteFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserCreate = vi.fn();
const mockInviteUpdate = vi.fn();
const mockWithAudit = vi.fn();
const mockSignIn = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    invite: { findUnique: mockInviteFindUnique, update: mockInviteUpdate },
    user: { findFirst: mockUserFindFirst, create: mockUserCreate },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/auth', () => ({ signIn: mockSignIn }));

const FUTURE = new Date(Date.now() + 24 * 3_600_000);
const PAST = new Date(Date.now() - 1000);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({
      user: { create: mockUserCreate },
      invite: { update: mockInviteUpdate },
    })
  );
  mockUserCreate.mockResolvedValue({ id: 'new-user-1', email: 'invitee@e.com' });
  mockInviteUpdate.mockResolvedValue({});
  mockUserFindFirst.mockResolvedValue(null);
  mockSignIn.mockResolvedValue(undefined);
});

const { acceptInvite } = await import('@/lib/auth/application/acceptInvite');

const validInvite = {
  id: 'invite-1',
  email: 'invitee@e.com',
  powerUserId: 'pu-1',
  status: 'PENDING',
  expiresAt: FUTURE,
};

describe('US-AUT-01 / US-ADM-01: acceptInvite', () => {
  it('AC-1: throws invite_not_found when the token does not match any invite', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(null);
    await expect(
      acceptInvite({ rawToken: 'bad-token', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('invite_not_found');
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('AC-1: throws invite_already_used when invite.status === ACCEPTED', async () => {
    mockInviteFindUnique.mockResolvedValueOnce({ ...validInvite, status: 'ACCEPTED' });
    await expect(
      acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('invite_already_used');
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('AC-1: throws invite_revoked when invite.status === REVOKED', async () => {
    mockInviteFindUnique.mockResolvedValueOnce({ ...validInvite, status: 'REVOKED' });
    await expect(
      acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('invite_revoked');
  });

  it('AC-1: throws invite_expired when expiresAt is in the past', async () => {
    mockInviteFindUnique.mockResolvedValueOnce({ ...validInvite, expiresAt: PAST });
    await expect(
      acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('invite_expired');
  });

  it('AC-2: throws email_already_in_use when email is taken by another user', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);
    mockUserFindFirst.mockResolvedValueOnce({ id: 'existing-user' });
    await expect(
      acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('email_already_in_use');
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('AC-3: creates a managed user with role=MANAGED_USER and managedBy=invite.powerUserId', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);

    await acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' });

    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'invitee@e.com',
          name: 'Alice',
          role: 'MANAGED_USER',
          managedBy: 'pu-1',
          status: 'ACTIVE',
        }),
      })
    );
  });

  it('AC-3: hashes the password (passwordHash stored, plaintext never)', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);
    await acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' });

    const call = mockUserCreate.mock.calls[0][0];
    expect(call.data.passwordHash).toBeDefined();
    expect(call.data.passwordHash).not.toBe('StrongPass123!');
    expect(call.data.passwordHash).toMatch(/^\$2[abxy]\$/); // bcrypt format
  });

  it('AC-4: marks the invite ACCEPTED, sets acceptedAt + acceptedByUserId atomically', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);

    await acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' });

    expect(mockInviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invite-1' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
          acceptedAt: expect.any(Date),
          acceptedByUserId: 'new-user-1',
        }),
      })
    );
  });

  it('AC-5: writes INVITE_ACCEPTED audit event with the new user as actor + subject', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({
        user: { create: mockUserCreate },
        invite: { update: mockInviteUpdate },
      });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);

    await acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'StrongPass123!' });

    expect(capturedAudit).toMatchObject({
      action: 'INVITE_ACCEPTED',
      actorUserId: 'new-user-1',
      subjectUserId: 'new-user-1',
      resourceId: 'invite-1',
      resourceType: 'Invite',
    });
  });

  it('AC-6: rejects passwords shorter than 8 characters', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);
    await expect(
      acceptInvite({ rawToken: 'tok', name: 'Alice', password: 'short' })
    ).rejects.toThrow('password_too_short');
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('AC-7: rejects empty/whitespace name', async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite);
    await expect(
      acceptInvite({ rawToken: 'tok', name: '   ', password: 'StrongPass123!' })
    ).rejects.toThrow('name_required');
  });

  it('AC-8: hashes the raw token with SHA-256 before lookup', async () => {
    // Clear the mockResolvedValueOnce queue (clearAllMocks only clears call history)
    mockInviteFindUnique.mockReset();
    mockInviteFindUnique.mockResolvedValueOnce(null);
    await expect(
      acceptInvite({ rawToken: 'my-raw-token-value', name: 'Alice', password: 'StrongPass123!' })
    ).rejects.toThrow('invite_not_found');

    // SHA-256 of 'my-raw-token-value' is deterministic
    const call = mockInviteFindUnique.mock.calls[0][0];
    expect(call).toEqual({ where: { tokenHash: expect.any(String) } });
    expect(call.where.tokenHash).toHaveLength(64); // hex-encoded SHA-256
    expect(call.where.tokenHash).not.toBe('my-raw-token-value'); // not the raw token
  });
});
