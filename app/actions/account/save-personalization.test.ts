import { describe, it, expect, vi, beforeEach } from 'vitest';
import { savePersonalizationAction } from './save-personalization';
import { auth } from '@/lib/auth';
import { updatePersonalizationSettings } from '@/lib/shared/personalization.server';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/shared/personalization.server', () => ({
  updatePersonalizationSettings: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('savePersonalizationAction', () => {
  const mockAuth = auth as unknown as {
    mockResolvedValue: (val: unknown) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return unauthorized error when session is missing', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await savePersonalizationAction({
      accentColor: 'indigo',
      theme: 'dark',
    });

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(updatePersonalizationSettings).not.toHaveBeenCalled();
  });

  it('should return unauthorized error when userId is missing', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await savePersonalizationAction({
      accentColor: 'indigo',
      theme: 'dark',
    });

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(updatePersonalizationSettings).not.toHaveBeenCalled();
  });

  it('should return validation_error when inputs are malformed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } });

    // Invalid accentColor
    const result1 = await savePersonalizationAction({
      accentColor: 'cyan',
      theme: 'dark',
    });
    expect(result1).toEqual({ ok: false, error: 'validation_error' });

    // Invalid theme
    const result2 = await savePersonalizationAction({
      accentColor: 'indigo',
      theme: 'blue-theme',
    });
    expect(result2).toEqual({ ok: false, error: 'validation_error' });

    // Missing field
    const result3 = await savePersonalizationAction({
      theme: 'dark',
    });
    expect(result3).toEqual({ ok: false, error: 'validation_error' });

    expect(updatePersonalizationSettings).not.toHaveBeenCalled();
  });

  it('should call updatePersonalizationSettings when inputs are valid', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
    vi.mocked(updatePersonalizationSettings).mockResolvedValue({
      id: 'user-123',
      theme: 'system',
      accentColor: 'emerald',
      personalizationVersion: 2,
    });

    const input = {
      accentColor: 'emerald',
      theme: 'system',
    };

    const result = await savePersonalizationAction(input);

    expect(result).toEqual({ ok: true });
    expect(updatePersonalizationSettings).toHaveBeenCalledWith('user-123', {
      accentColor: 'emerald',
      theme: 'system',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('should return system_error and catch exceptions during update', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
    vi.mocked(updatePersonalizationSettings).mockRejectedValue(new Error('DB connection lost'));

    const result = await savePersonalizationAction({
      accentColor: 'rose',
      theme: 'light',
    });

    expect(result).toEqual({ ok: false, error: 'system_error' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
