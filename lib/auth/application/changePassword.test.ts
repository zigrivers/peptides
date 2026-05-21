import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockFindUnique, update: mockUpdate },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({
  withAudit: mockWithAudit,
}));

const { changePassword } = await import('./changePassword');

let CURRENT_HASH: string;
beforeAll(async () => {
  CURRENT_HASH = await bcrypt.hash('CurrentPass123', 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockImplementation(() => Promise.resolve({ passwordHash: CURRENT_HASH }));
  mockWithAudit.mockImplementation(async (mutation, _audit) =>
    mutation({ user: { update: mockUpdate } })
  );
  mockUpdate.mockResolvedValue({});
});

describe('changePassword', () => {
  it('throws user_not_found when userId has no user record', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      changePassword({ userId: 'ghost', currentPassword: 'CurrentPass123', newPassword: 'NewValidPass456' })
    ).rejects.toThrow('user_not_found');
  });

  it('throws current_password_invalid when current password is wrong', async () => {
    await expect(
      changePassword({ userId: 'u1', currentPassword: 'WrongPassword!', newPassword: 'NewValidPass456' })
    ).rejects.toThrow('current_password_invalid');
  });

  it('AC field-leak: throws current_password_invalid even when new password is too short', async () => {
    // Wrong current password + short new password → must throw current_password_invalid,
    // not password_too_short (security §3.2 field-leak prevention).
    await expect(
      changePassword({ userId: 'u1', currentPassword: 'WrongPassword!', newPassword: 'short' })
    ).rejects.toThrow('current_password_invalid');
  });

  it('throws password_too_short when new password is fewer than 12 characters', async () => {
    await expect(
      changePassword({ userId: 'u1', currentPassword: 'CurrentPass123', newPassword: 'tooshort' })
    ).rejects.toThrow('password_too_short');
  });

  it('throws password_same_as_current when new password equals current password', async () => {
    await expect(
      changePassword({ userId: 'u1', currentPassword: 'CurrentPass123', newPassword: 'CurrentPass123' })
    ).rejects.toThrow('password_same_as_current');
  });

  it('resolves with otherSessionsRevoked: 0 and calls withAudit on success', async () => {
    const result = await changePassword({
      userId: 'u1',
      currentPassword: 'CurrentPass123',
      newPassword: 'BrandNewPass789',
    });
    expect(result.otherSessionsRevoked).toBe(0);
    expect(mockWithAudit).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ action: 'PASSWORD_CHANGED', actorUserId: 'u1' })
    );
  });
});
