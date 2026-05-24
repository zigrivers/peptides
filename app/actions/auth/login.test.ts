import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginAction } from './login';
import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
}));

vi.mock('next-auth', () => {
  class MockAuthError extends Error {
    type?: string;
  }
  return {
    AuthError: MockAuthError,
  };
});

describe('loginAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error if email or password is empty', async () => {
    const formData = new FormData();
    const state = await loginAction(null, formData);
    expect(state.error).toBe('Please enter both email and password.');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('calls signIn credentials and returns empty on success', async () => {
    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('password', 'password123');

    vi.mocked(signIn).mockResolvedValue(undefined as unknown as Promise<never>);

    const state = await loginAction(null, formData);
    expect(state).toEqual({});
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirectTo: '/dashboard',
    });
  });

  it('re-throws redirect error thrown by signIn', async () => {
    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('password', 'password123');

    const redirectError = new Error('NEXT_REDIRECT');
    vi.mocked(signIn).mockRejectedValue(redirectError);

    await expect(loginAction(null, formData)).rejects.toThrow('NEXT_REDIRECT');
  });

  it('uses validated callbackUrl when starts with single slash', async () => {
    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('password', 'password123');
    formData.append('callbackUrl', '/tracker');

    vi.mocked(signIn).mockResolvedValue(undefined as unknown as Promise<never>);

    await loginAction(null, formData);
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirectTo: '/tracker',
    });
  });

  it('rejects callbackUrl when it is invalid or not starts with single slash', async () => {
    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('password', 'password123');
    formData.append('callbackUrl', '//evil.com');

    vi.mocked(signIn).mockResolvedValue(undefined as unknown as Promise<never>);

    await loginAction(null, formData);
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirectTo: '/dashboard',
    });
  });

  it('returns error message when credentials validation fails', async () => {
    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('password', 'wrongpassword');

    const authError = new AuthError();
    authError.type = 'CredentialsSignin';
    vi.mocked(signIn).mockRejectedValue(authError);

    const state = await loginAction(null, formData);
    expect(state.error).toBe('Invalid email or password.');
  });
});
