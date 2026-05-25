import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  convertDoseToMg,
  decrementVialInventory,
  incrementVialInventory,
} from './InventoryService';

describe('InventoryService', () => {
  const mockVial = {
    totalMg: new Decimal('10'),
    bacWaterMl: new Decimal('2'),
    remainingMg: new Decimal('10'),
  };

  describe('convertDoseToMg', () => {
    it('converts mcg to mg correctly', () => {
      const res = convertDoseToMg(new Decimal('250'), 'mcg', mockVial);
      expect(res.toNumber()).toBe(0.25);
    });

    it('converts mg to mg directly', () => {
      const res = convertDoseToMg(new Decimal('2.5'), 'mg', mockVial);
      expect(res.toNumber()).toBe(2.5);
    });

    it('converts mL to mg using vial concentration', () => {
      // concentration is 10mg / 2mL = 5mg/mL.
      // 0.5 mL should be 0.5 * 5 = 2.5 mg.
      const res = convertDoseToMg(new Decimal('0.5'), 'mL', mockVial);
      expect(res.toNumber()).toBe(2.5);
    });

    it('converts IU to mg with U-100 syringe preference', () => {
      // 10 IU under U-100 = 0.1 mL.
      // 0.1 mL * 5 mg/mL = 0.5 mg.
      const res = convertDoseToMg(new Decimal('10'), 'IU', mockVial, 'U100');
      expect(res.toNumber()).toBe(0.5);
    });

    it('converts IU to mg with U-40 syringe preference', () => {
      // 10 IU under U-40 = 10 * 0.025 = 0.25 mL.
      // 0.25 mL * 5 mg/mL = 1.25 mg.
      const res = convertDoseToMg(new Decimal('10'), 'IU', mockVial, 'U40');
      expect(res.toNumber()).toBe(1.25);
    });

    it('throws if trying to convert mL/IU without reconstituted vial', () => {
      const dryVial = { totalMg: new Decimal('10'), bacWaterMl: null };
      expect(() => convertDoseToMg(new Decimal('10'), 'IU', dryVial)).toThrow('vial_not_reconstituted');
    });
  });

  describe('decrementVialInventory', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        vial: {
          findFirst: vi.fn(),
          updateMany: vi.fn(),
          findUnique: vi.fn(),
        },
      };
    });

    it('successfully decrements inventory and throws on underflow', async () => {
      mockTx.vial.findFirst.mockResolvedValue({
        id: 'vial-1',
        userId: 'user-1',
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('5'),
        status: 'RECONSTITUTED',
      });
      mockTx.vial.updateMany.mockResolvedValue({ count: 1 });
      mockTx.vial.findUnique.mockResolvedValue({ remainingMg: new Decimal('4.5') });

      await decrementVialInventory(mockTx, 'user-1', 'vial-1', new Decimal('500'), 'mcg', 'U100');

      expect(mockTx.vial.updateMany).toHaveBeenCalledWith({
        where: { id: 'vial-1', userId: 'user-1', remainingMg: { gte: new Decimal('0.5') } },
        data: { remainingMg: { decrement: new Decimal('0.5') } },
      });
    });

    it('sets status to DEPLETED if inventory hits zero', async () => {
      mockTx.vial.findFirst.mockResolvedValue({
        id: 'vial-1',
        userId: 'user-1',
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('0.5'),
        status: 'RECONSTITUTED',
      });
      mockTx.vial.updateMany.mockResolvedValue({ count: 1 });
      mockTx.vial.findUnique.mockResolvedValue({ remainingMg: new Decimal('0') });

      await decrementVialInventory(mockTx, 'user-1', 'vial-1', new Decimal('0.5'), 'mg', 'U100');

      expect(mockTx.vial.updateMany).toHaveBeenCalledWith({
        where: { id: 'vial-1', userId: 'user-1' },
        data: { status: 'DEPLETED' },
      });
    });

    it('throws insufficient_inventory if count is 0', async () => {
      mockTx.vial.findFirst.mockResolvedValue({
        id: 'vial-1',
        userId: 'user-1',
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('0.2'),
        status: 'RECONSTITUTED',
      });
      mockTx.vial.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        decrementVialInventory(mockTx, 'user-1', 'vial-1', new Decimal('0.5'), 'mg', 'U100')
      ).rejects.toThrow('insufficient_inventory');
    });
  });

  describe('incrementVialInventory', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        vial: {
          findFirst: vi.fn(),
          updateMany: vi.fn(),
          findUnique: vi.fn(),
        },
      };
    });

    it('increments inventory and restores status to RECONSTITUTED from DEPLETED', async () => {
      mockTx.vial.findFirst.mockResolvedValue({
        id: 'vial-1',
        userId: 'user-1',
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('0'),
        status: 'DEPLETED',
      });
      mockTx.vial.updateMany.mockResolvedValue({ count: 1 });
      mockTx.vial.findUnique.mockResolvedValue({ remainingMg: new Decimal('0.5'), status: 'DEPLETED' });

      await incrementVialInventory(mockTx, 'user-1', 'vial-1', new Decimal('0.5'), 'mg', 'U100');

      expect(mockTx.vial.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'vial-1', userId: 'user-1' },
        data: { remainingMg: { increment: new Decimal('0.5') } },
      });

      expect(mockTx.vial.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'vial-1', userId: 'user-1', status: 'DEPLETED' },
        data: { status: 'RECONSTITUTED' },
      });
    });

    it('does not restore status if status was not DEPLETED', async () => {
      mockTx.vial.findFirst.mockResolvedValue({
        id: 'vial-1',
        userId: 'user-1',
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('2'),
        status: 'RECONSTITUTED', // Already reconstituted, or maybe EXPIRED
      });
      mockTx.vial.updateMany.mockResolvedValue({ count: 1 });
      mockTx.vial.findUnique.mockResolvedValue({ remainingMg: new Decimal('2.5'), status: 'RECONSTITUTED' });

      await incrementVialInventory(mockTx, 'user-1', 'vial-1', new Decimal('0.5'), 'mg', 'U100');

      expect(mockTx.vial.updateMany).toHaveBeenCalledTimes(1); // Only the increment query, no status restoration query
    });
  });
});
