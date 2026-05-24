'use server';

import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';

export interface LoginActionState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginActionState | null,
  formData: FormData
): Promise<LoginActionState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  let redirectTo = '/dashboard';
  const reqRedirect = formData.get('callbackUrl') as string | null;
  if (reqRedirect && reqRedirect.startsWith('/') && !reqRedirect.startsWith('//')) {
    redirectTo = reqRedirect;
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo,
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password.' };
        default:
          return { error: 'Something went wrong. Please try again.' };
      }
    }
    throw error;
  }
}
