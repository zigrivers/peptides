import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProtocolAction } from './create-protocol';
import { auth } from '@/lib/auth';
import { createProtocol, isAuthorizedSubject } from '@/lib/tracker/application/ProtocolService';
import { revalidatePath } from 'next/cache';
import type { Protocol } from '@/lib/tracker/domain/types';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tracker/application/ProtocolService', () => ({
  createProtocol: vi.fn(),
  isAuthorizedSubject: vi.fn(),
}));

describe('createProtocolAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a stacked BPC/TB-500 dose unit and preserves the combined amount', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    vi.mocked(isAuthorizedSubject).mockResolvedValue(true);

    const protocol: Protocol = {
      id: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      userId: '6f530cca-4017-4b9e-8354-64d8884708bd',
      compoundId: 'bpc-tb500',
      cycleId: null,
      dose: { amount: '1000/10.0', unit: 'mcg/mg' },
      schedule: { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Tue', 'Fri'] },
      administrationRoute: 'SubQ',
      status: 'ACTIVE',
      startDate: new Date('2026-06-19T00:00:00.000Z'),
      endDate: null,
      notes: null,
    };
    vi.mocked(createProtocol).mockResolvedValue(protocol);

    const result = await createProtocolAction({
      subjectUserId: '6f530cca-4017-4b9e-8354-64d8884708bd',
      compoundId: 'bpc-tb500',
      dose: { amount: '1000/10.0', unit: 'mcg/mg' },
      schedule: { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Tue', 'Fri'] },
      administrationRoute: 'SubQ',
      startDate: new Date('2026-06-19T00:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a' });
    expect(createProtocol).toHaveBeenCalledWith(
      expect.objectContaining({
        dose: { amount: '1000/10.0', unit: 'mcg/mg' },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/regimen');
  });
});
