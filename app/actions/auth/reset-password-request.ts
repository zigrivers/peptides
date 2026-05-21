'use server';

import { requestPasswordReset } from '@/lib/auth/application/requestPasswordReset';

export async function resetPasswordRequestAction(email: string): Promise<void> {
  if (typeof email !== 'string' || !email.includes('@')) return;
  // Always resolves — no error surfaced to caller (email enumeration prevention).
  try {
    await requestPasswordReset(email);
  } catch {
    // Swallow all errors; caller always receives void (maps to HTTP 204).
  }
}
