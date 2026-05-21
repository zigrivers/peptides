import { describe, it, expect } from 'vitest';

/**
 * Story: US-AUT-07 - Change Own Email
 */
describe('US-AUT-07: Change Own Email', () => {
  it.todo('AC-1: changing email requires current-password gate (requires DB)');
  it.todo('AC-2: verification email sent to new address; change only takes effect after link clicked (requires DB + email)');
  it.todo('AC-3: conflict check — new email in use returns same error regardless of ownership (no enumeration)');
  it.todo('AC-4: old-address notification sent with 48h revert link after change applied (requires DB + email)');
  it.todo('AC-5: full audit chain — request, verify, complete events recorded (requires DB)');
  it.todo('AC-6: revert link valid for 48h; using it after expiry returns token_expired');
  it.todo('AC-7: token reuse after verify returns 410 gone (single-use)');
});
