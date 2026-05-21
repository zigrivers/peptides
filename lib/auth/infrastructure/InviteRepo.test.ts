import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    invite: {
      create: mockCreate,
      findFirst: mockFindFirst,
      updateMany: mockUpdateMany,
      findMany: mockFindMany,
    },
  },
}));

const { InviteRepo } = await import('./InviteRepo');

beforeEach(() => { vi.clearAllMocks(); });

describe('InviteRepo', () => {
  describe('create', () => {
    it('creates an invite with tokenHash, email, powerUserId, expiresAt', async () => {
      mockCreate.mockResolvedValue({ id: 'inv-1' });
      const tx = { invite: { create: mockCreate } };
      await InviteRepo.create(tx, { email: 'u@e.com', powerUserId: 'pu-1', tokenHash: 'h', expiresAt: new Date() });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tokenHash: 'h', email: 'u@e.com', powerUserId: 'pu-1' }) })
      );
    });
  });

  describe('findByTokenHash', () => {
    it('queries by tokenHash using findUnique (tokenHash is unique)', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue(null);
      // Access prisma via the vi.mock scope
      const { prisma: p } = await import('@/lib/shared/prisma');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.invite as any).findUnique = mockFindUnique;
      await InviteRepo.findByTokenHash('testhash');
      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'testhash' } })
      );
    });
  });

  describe('findById', () => {
    it('queries by id and powerUserId for ownership check', async () => {
      mockFindFirst.mockResolvedValue(null);
      await InviteRepo.findById('inv-1', 'pu-1');
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1', powerUserId: 'pu-1' } })
      );
    });
  });

  describe('revokeById', () => {
    it('sets status to REVOKED only when current status matches onlyIfStatus', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });
      const tx = { invite: { updateMany: mockUpdateMany } };
      await InviteRepo.revokeById(tx, 'inv-1', 'pu-1', 'PENDING');
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1', powerUserId: 'pu-1', status: 'PENDING' }, data: { status: 'REVOKED' } })
      );
    });
  });

  describe('findPendingByEmail', () => {
    it('queries for PENDING invite by email', async () => {
      mockFindFirst.mockResolvedValue(null);
      await InviteRepo.findPendingByEmail('u@e.com');
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'u@e.com', status: 'PENDING' } })
      );
    });
  });
});
