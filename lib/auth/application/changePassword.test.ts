import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';

const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
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
  mockFindUnique.mockImplementation(() =>
    Promise.resolve({ passwordHash: CURRENT_HASH, passwordVersion: 1 })
  );
  mockWithAudit.mockImplementation(async (mutation, _audit) =>
    mutation({ user: { updateMany: mockUpdateMany } })
  );
  mockUpdateMany.mockResolvedValue({ count: 1 });
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

  it('throws concurrent_password_change when optimistic lock fails (count === 0)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      changePassword({ userId: 'u1', currentPassword: 'CurrentPass123', newPassword: 'BrandNewPass789' })
    ).rejects.toThrow('concurrent_password_change');
  });

  it('resolves with allSessionsRevoked: true and increments passwordVersion', async () => {
    const result = await changePassword({
      userId: 'u1',
      currentPassword: 'CurrentPass123',
      newPassword: 'BrandNewPass789',
    });
    expect(result.allSessionsRevoked).toBe(true);
    expect(mockWithAudit).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ action: 'PASSWORD_CHANGED', actorUserId: 'u1' })
    );
  });

  it('uses optimistic concurrency — updateMany includes current passwordHash in WHERE', async () => {
    await changePassword({
      userId: 'u1',
      currentPassword: 'CurrentPass123',
      newPassword: 'BrandNewPass789',
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1', passwordHash: CURRENT_HASH }),
        data: expect.objectContaining({ passwordVersion: { increment: 1 } }),
      })
    );
  });
});
