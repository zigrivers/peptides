import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateProtocolAction } from './update-protocol';
import { auth } from '@/lib/auth';
import { updateProtocol } from '@/lib/tracker/application/ProtocolService';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tracker/application/ProtocolService', () => ({
  updateProtocol: vi.fn(),
}));

describe('updateProtocolAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return unauthorized when session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await updateProtocolAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      dose: { amount: '250', unit: 'mcg' },
    });

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('should return validation_error when schema validation fails', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);

    const result = await updateProtocolAction({
      protocolId: 'invalid-uuid',
      dose: { amount: '', unit: 'mcg' },
    });

    expect(result.ok).toBe(false);
    expect((result as { error?: string }).error).toBe('validation_error');
  });

  it('should call updateProtocol and return ok on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    vi.mocked(updateProtocol).mockResolvedValue({
      id: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      userId: 'user-123',
    } as any);

    const result = await updateProtocolAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      dose: { amount: '300', unit: 'mcg' },
    });

    expect(result).toEqual({ ok: true, protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a' });
    expect(updateProtocol).toHaveBeenCalledWith({
      actorUserId: 'user-123',
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      dose: { amount: '300', unit: 'mcg' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/tracker');
    expect(revalidatePath).toHaveBeenCalledWith(`/tracker/protocols/45a13798-41d4-46e8-9fdd-3812e6f0982a`);
  });

  it('should handle system errors and not found cases', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as never);
    vi.mocked(updateProtocol).mockRejectedValue(new Error('Protocol not found: x'));

    const result = await updateProtocolAction({
      protocolId: '45a13798-41d4-46e8-9fdd-3812e6f0982a',
      dose: { amount: '300', unit: 'mcg' },
    });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});
