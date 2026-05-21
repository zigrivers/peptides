'use server';

import { createRateLimiter } from '@/lib/shared/rateLimiter';
import { requestPasswordReset } from '@/lib/auth/application/requestPasswordReset';

// 5 requests per email per hour — matches api-contracts.md spec.
const resetRequestLimiter = createRateLimiter(5, 60 * 60 * 1000);

export async function resetPasswordRequestAction(email: unknown): Promise<void> {
  if (typeof email !== 'string' || !email.includes('@')) return;
  // Silent rate limit — no error surfaced to caller (email enumeration prevention).
  if (!resetRequestLimiter.check(email.trim().toLowerCase())) return;
  // Always resolves — no error surfaced to caller (email enumeration prevention).
  try {
    await requestPasswordReset(email);
  } catch {
    // Swallow all errors; caller always receives void (maps to HTTP 204).
  }
}
