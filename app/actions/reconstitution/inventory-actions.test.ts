import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addDryVialsAction,
  reconstituteDryVialAction,
  deleteVialAction,
  addReconstitutedVialAction,
} from './inventory-actions';
import { auth } from '@/lib/auth';
import {
  saveDryVials,
  reconstituteVial,
  deleteVial,
  saveVial,
} from '@/lib/reconstitution/application/VialService';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/reconstitution/application/VialService', () => ({
  saveDryVials: vi.fn(),
  reconstituteVial: vi.fn(),
  deleteVial: vi.fn(),
  saveVial: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Inventory Server Actions', () => {
  const mockAuth = auth as unknown as {
    mockResolvedValue: (val: unknown) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addDryVialsAction', () => {
    it('should return unauthorized when session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await addDryVialsAction({
        compoundId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
        totalMg: '10',
        quantity: 5,
      });

      expect(result).toEqual({ ok: false, error: 'unauthorized' });
      expect(saveDryVials).not.toHaveBeenCalled();
    });

    it('should return validation_error when inputs are malformed', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });

      // Negative quantity
      const result = await addDryVialsAction({
        compoundId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
        totalMg: '10',
        quantity: -1,
      });

      expect(result).toEqual({
        ok: false,
        error: 'validation_error',
        message: expect.any(String),
      });
    });

    it('should call saveDryVials and revalidate paths on success', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
      vi.mocked(saveDryVials).mockResolvedValue(undefined as never);

      const compoundId = '45a13798-41d4-46e8-9fdd-3812e6f0982a';
      const result = await addDryVialsAction({
        compoundId,
        totalMg: '5.0',
        quantity: 3,
        expiresAt: '2027-01-01T00:00:00.000Z',
      });

      expect(result).toEqual({ ok: true });
      expect(saveDryVials).toHaveBeenCalledWith({
        userId: 'user-123',
        compoundId,
        totalMg: expect.any(Object),
        quantity: 3,
        expiresAt: expect.any(Date),
      });
      expect(revalidatePath).toHaveBeenCalledWith('/reconstitution');
      expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('reconstituteDryVialAction', () => {
    it('should return unauthorized when session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await reconstituteDryVialAction({
        vialId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
        bacWaterMl: '2.0',
      });

      expect(result).toEqual({ ok: false, error: 'unauthorized' });
    });

    it('should return validation_error when inputs are invalid', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });

      const result = await reconstituteDryVialAction({
        vialId: 'invalid-uuid',
        bacWaterMl: '-1.0',
      });

      expect(result).toEqual({
        ok: false,
        error: 'validation_error',
        message: expect.any(String),
      });
    });

    it('should call reconstituteVial and revalidate on success', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
      vi.mocked(reconstituteVial).mockResolvedValue(undefined as never);

      const vialId = '45a13798-41d4-46e8-9fdd-3812e6f0982a';
      const result = await reconstituteDryVialAction({
        vialId,
        bacWaterMl: '1.5',
      });

      expect(result).toEqual({ ok: true });
      expect(reconstituteVial).toHaveBeenCalledWith({
        userId: 'user-123',
        vialId,
        bacWaterMl: expect.any(Object),
        expiresAt: undefined,
      });
      expect(revalidatePath).toHaveBeenCalledWith('/reconstitution');
      expect(revalidatePath).toHaveBeenCalledWith('/tracker');
    });
  });

  describe('deleteVialAction', () => {
    it('should return unauthorized when session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await deleteVialAction('45a13798-41d4-46e8-9fdd-3812e6f0982a');

      expect(result).toEqual({ ok: false, error: 'unauthorized' });
    });

    it('should call deleteVial and revalidate on success', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
      vi.mocked(deleteVial).mockResolvedValue(undefined as never);

      const result = await deleteVialAction('45a13798-41d4-46e8-9fdd-3812e6f0982a');

      expect(result).toEqual({ ok: true });
      expect(deleteVial).toHaveBeenCalledWith('user-123', '45a13798-41d4-46e8-9fdd-3812e6f0982a');
      expect(revalidatePath).toHaveBeenCalledWith('/reconstitution');
      expect(revalidatePath).toHaveBeenCalledWith('/tracker');
    });
  });

  describe('addReconstitutedVialAction', () => {
    it('should return unauthorized when session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await addReconstitutedVialAction({
        compoundId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
        totalMg: '10',
        bacWaterMl: '2.0',
      });

      expect(result).toEqual({ ok: false, error: 'unauthorized' });
    });

    it('should call saveVial and revalidate on success', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
      vi.mocked(saveVial).mockResolvedValue(undefined as never);

      const compoundId = '45a13798-41d4-46e8-9fdd-3812e6f0982a';
      const result = await addReconstitutedVialAction({
        compoundId,
        totalMg: '5.0',
        bacWaterMl: '1.0',
      });

      expect(result).toEqual({ ok: true });
      expect(saveVial).toHaveBeenCalledWith({
        userId: 'user-123',
        compoundId,
        totalMg: expect.any(Object),
        bacWaterMl: expect.any(Object),
        expiresAt: undefined,
      });
      expect(revalidatePath).toHaveBeenCalledWith('/reconstitution');
      expect(revalidatePath).toHaveBeenCalledWith('/tracker');
    });
  });
});
