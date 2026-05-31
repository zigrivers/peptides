import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
import {
  updateVialRemainingMg,
  getSerializedVialsForCompound,
  VIAL_STATUS,
} from '@/lib/reconstitution/application/VialService';

vi.mock('@/lib/shared/prisma', () => {
  const mockFindFirst = vi.fn();
  const mockFindMany = vi.fn();
  const mockUpdateMany = vi.fn();
  const mockUserFindUnique = vi.fn();
  const mockProtocolFindMany = vi.fn();
  const mockAuditEventCreate = vi.fn();

  return {
    prisma: {
      vial: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
        updateMany: mockUpdateMany,
      },
      user: {
        findUnique: mockUserFindUnique,
      },
      protocol: {
        findMany: mockProtocolFindMany,
      },
      auditEvent: {
        create: mockAuditEventCreate,
      },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          vial: {
            findFirst: mockFindFirst,
            updateMany: mockUpdateMany,
          },
          auditEvent: {
            create: mockAuditEventCreate,
          },
        };
        return fn(tx);
      }),
    },
  };
});

describe('Inventory Management from Catalog Detail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateVialRemainingMg', () => {
    it('successfully updates remaining mg and maintains RECONSTITUTED status', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('8'),
        status: VIAL_STATUS.RECONSTITUTED,
        bacWaterMl: new Decimal('2'),
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: new Date('2026-05-01'),
        compound: { name: 'Compound A', slug: 'compound-a' },
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);
      vi.mocked(prisma.vial.updateMany).mockResolvedValue({ count: 1 });

      const result = await updateVialRemainingMg({
        userId: 'user-1',
        vialId: 'vial-1',
        remainingMg: new Decimal('5'),
      });

      expect(prisma.vial.updateMany).toHaveBeenCalledWith({
        where: { id: 'vial-1', userId: 'user-1' },
        data: {
          remainingMg: new Decimal('5'),
          status: VIAL_STATUS.RECONSTITUTED,
        },
      });

      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          category: 'Reconstitution',
          action: 'VIAL_QUANTITY_UPDATED',
          resourceId: 'vial-1',
          resourceType: 'Vial',
          oldValues: { remainingMg: '8', status: 'RECONSTITUTED' },
          newValues: { remainingMg: '5.000', status: 'RECONSTITUTED' },
        }),
      });

      expect(result.id).toBe('vial-1');
    });

    it('transitions status to DEPLETED when remaining mg reaches 0', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('8'),
        status: VIAL_STATUS.RECONSTITUTED,
        bacWaterMl: new Decimal('2'),
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: new Date('2026-05-01'),
        compound: { name: 'Compound A', slug: 'compound-a' },
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);
      vi.mocked(prisma.vial.updateMany).mockResolvedValue({ count: 1 });

      await updateVialRemainingMg({
        userId: 'user-1',
        vialId: 'vial-1',
        remainingMg: new Decimal('0'),
      });

      expect(prisma.vial.updateMany).toHaveBeenCalledWith({
        where: { id: 'vial-1', userId: 'user-1' },
        data: {
          remainingMg: new Decimal('0'),
          status: VIAL_STATUS.DEPLETED,
        },
      });

      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          category: 'Reconstitution',
          action: 'VIAL_QUANTITY_UPDATED',
          resourceId: 'vial-1',
          oldValues: { remainingMg: '8', status: 'RECONSTITUTED' },
          newValues: { remainingMg: '0.000', status: 'DEPLETED' },
        }),
      });
    });

    it('restores status to RECONSTITUTED when remaining mg increases from 0 (DEPLETED)', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('0'),
        status: VIAL_STATUS.DEPLETED,
        bacWaterMl: new Decimal('2'),
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: new Date('2026-05-01'),
        compound: { name: 'Compound A', slug: 'compound-a' },
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);
      vi.mocked(prisma.vial.updateMany).mockResolvedValue({ count: 1 });

      await updateVialRemainingMg({
        userId: 'user-1',
        vialId: 'vial-1',
        remainingMg: new Decimal('3'),
      });

      expect(prisma.vial.updateMany).toHaveBeenCalledWith({
        where: { id: 'vial-1', userId: 'user-1' },
        data: {
          remainingMg: new Decimal('3'),
          status: VIAL_STATUS.RECONSTITUTED,
        },
      });
    });

    it('throws error if vial is not found or not owned', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(null);

      await expect(
        updateVialRemainingMg({
          userId: 'user-1',
          vialId: 'vial-1',
          remainingMg: new Decimal('5'),
        })
      ).rejects.toThrow('vial_not_found_or_not_owned');
    });

    it('throws error if vial is DRY (unmixed)', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('10'),
        status: VIAL_STATUS.DRY,
        bacWaterMl: null,
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: null,
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);

      await expect(
        updateVialRemainingMg({
          userId: 'user-1',
          vialId: 'vial-1',
          remainingMg: new Decimal('5'),
        })
      ).rejects.toThrow('cannot_adjust_dry_vial_mg');
    });

    it('throws error if remaining mg exceeds total mg', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('8'),
        status: VIAL_STATUS.RECONSTITUTED,
        bacWaterMl: new Decimal('2'),
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: new Date('2026-05-01'),
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);

      await expect(
        updateVialRemainingMg({
          userId: 'user-1',
          vialId: 'vial-1',
          remainingMg: new Decimal('12'),
        })
      ).rejects.toThrow('remaining_mg_cannot_exceed_total_mg');
    });

    it('throws error if remaining mg is negative', async () => {
      const mockVial = {
        id: 'vial-1',
        userId: 'user-1',
        compoundId: 'comp-1',
        totalMg: new Decimal('10'),
        remainingMg: new Decimal('8'),
        status: VIAL_STATUS.RECONSTITUTED,
        bacWaterMl: new Decimal('2'),
        expiresAt: new Date('2026-12-31'),
        reconstitutedAt: new Date('2026-05-01'),
      } as any;

      vi.mocked(prisma.vial.findFirst).mockResolvedValue(mockVial);

      await expect(
        updateVialRemainingMg({
          userId: 'user-1',
          vialId: 'vial-1',
          remainingMg: new Decimal('-1'),
        })
      ).rejects.toThrow('remaining_mg_cannot_be_negative');
    });
  });

  describe('getSerializedVialsForCompound', () => {
    it('correctly queries database with userId and compoundId, returns serialized data', async () => {
      const mockVials = [
        {
          id: 'vial-1',
          userId: 'user-1',
          compoundId: 'comp-1',
          totalMg: new Decimal('10'),
          remainingMg: new Decimal('8'),
          status: VIAL_STATUS.RECONSTITUTED,
          bacWaterMl: new Decimal('2'),
          expiresAt: new Date('2026-12-31'),
          reconstitutedAt: new Date('2026-05-01'),
          compound: { name: 'Compound A', slug: 'compound-a' },
        },
      ] as any[];

      vi.mocked(prisma.vial.findMany).mockResolvedValue(mockVials);
      vi.mocked(prisma.protocol.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ syringeStandard: 'U100' } as any);

      const result = await getSerializedVialsForCompound('user-1', 'comp-1');

      expect(prisma.vial.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          compoundId: 'comp-1',
          status: { in: [VIAL_STATUS.DRY, VIAL_STATUS.RECONSTITUTED] },
        },
        include: { compound: { select: { name: true, slug: true } } },
        orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vial-1');
      expect(result[0].totalMg).toBe('10.000');
      expect(result[0].remainingMg).toBe('8.000');
      expect(result[0].bacWaterMl).toBe('2.000');
    });
  });
});
