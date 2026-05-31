import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleObservedBenefitAction } from './toggle-observed-benefit';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock prisma
const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    protocol: {
      findFirst: () => mockFindFirst(),
      updateMany: () => mockUpdateMany(),
    },
    $transaction: vi.fn((fn) => {
      const tx = {
        protocol: {
          findFirst: mockFindFirst,
          updateMany: mockUpdateMany,
        },
        auditEvent: {
          create: mockAuditCreate,
        },
      };
      return fn(tx);
    }),
  },
}));

describe('toggleObservedBenefitAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return unauthorized when session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await toggleObservedBenefitAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      week: 1,
      benefitText: 'Energy increase',
    });

    expect(result).toEqual({ ok: false, error: 'unauthorized', message: 'You must be signed in.' });
  });

  it('should return invalid_input when schema validation fails', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);

    const result = await toggleObservedBenefitAction({
      protocolId: 'invalid-uuid',
      week: -1,
      benefitText: '',
    });

    expect(result.ok).toBe(false);
    expect((result as { error?: string }).error).toBe('invalid_input');
  });

  it('should return protocol_not_found if query returns null due to ownership boundaries', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    mockFindFirst.mockResolvedValue(null);

    const result = await toggleObservedBenefitAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      week: 1,
      benefitText: 'Energy increase',
    });

    expect(result).toEqual({
      ok: false,
      error: 'protocol_not_found',
      message: 'Protocol not found.',
    });
  });

  it('should add a benefit if not already in observedBenefits list', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    
    // Protocol has no benefits yet
    mockFindFirst.mockResolvedValue({
      id: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      userId: 'user-123',
      observedBenefits: null,
    });

    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await toggleObservedBenefitAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      week: 2,
      benefitText: 'Fat loss',
    });

    expect(result).toEqual({
      ok: true,
      observedBenefits: ['2:Fat loss'],
    });

    expect(mockFindFirst).toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/tracker');
  });

  it('should remove a benefit if it is already in observedBenefits list', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    
    mockFindFirst.mockResolvedValue({
      id: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      userId: 'user-123',
      observedBenefits: ['2:Fat loss', '1:Appetite suppression'],
    });

    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await toggleObservedBenefitAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      week: 2,
      benefitText: 'Fat loss',
    });

    expect(result).toEqual({
      ok: true,
      observedBenefits: ['1:Appetite suppression'],
    });

    expect(mockUpdateMany).toHaveBeenCalled();
  });
});
