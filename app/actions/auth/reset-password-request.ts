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
  // Timing: both found/not-found paths invoke the same DB lookup; remaining
  // variance (token creation + email send) is bounded by rate limiting (5/hour)
  // and acceptable for a private single-tenant deployment.
  try {
    await requestPasswordReset(email);
  } catch (err) {
    // Log for observability; never surface to caller (email enumeration prevention).
    console.error('[resetPasswordRequest] internal error:', err);
  }
}
