import { describe, it, expect } from 'vitest';
import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';

/**
 * Story: US-AUT-07 - Change Own Email
 */
describe('US-AUT-07: Change Own Email', () => {
  it.todo('AC-1: changing email requires current-password gate (requires DB)');
  it.todo('AC-2: verification email sent to new address; change only takes effect after link clicked (requires DB + email)');
  it.todo('AC-3: conflict check — new email in use returns same error regardless of ownership (no enumeration)');
  it.todo('AC-4: old-address notification sent with 48h revert link after change applied (requires DB + email)');
  it.todo('AC-5: full audit chain — request, verify, complete events recorded (requires DB)');

  it('AC-6: verify token expires in 24h; revert window is 48h from apply time', () => {
    const msIn24h = 24 * 60 * 60 * 1000;
    const msIn48h = 48 * 60 * 60 * 1000;
    const before = Date.now();
    const verifyExpiry = EmailChangeToken.verifyExpiry();
    const revertExpiry = EmailChangeToken.revertExpiry(new Date(before));
    const after = Date.now();

    expect(verifyExpiry.getTime()).toBeGreaterThanOrEqual(before + msIn24h);
    expect(verifyExpiry.getTime()).toBeLessThanOrEqual(after + msIn24h + 100);
    expect(revertExpiry.getTime()).toBeGreaterThanOrEqual(before + msIn48h);
    expect(revertExpiry.getTime()).toBeLessThanOrEqual(after + msIn48h + 100);
  });

  it('AC-6: verify token past expiresAt → token_expired', () => {
    const record = { status: 'PENDING', expiresAt: new Date(Date.now() - 1) };
    expect(() => EmailChangeToken.validateForVerify(record)).toThrow('token_expired');
  });

  it('AC-7: token reuse after apply returns token_already_used (via validateForVerify)', () => {
    const future = new Date(Date.now() + 3_600_000);
    const appliedRecord = { status: 'APPLIED', expiresAt: future };
    expect(() => EmailChangeToken.validateForVerify(appliedRecord)).toThrow('token_already_used');
  });

  it('AC-7: revert token reuse after revert returns token_already_used (via validateForRevert)', () => {
    const future = new Date(Date.now() + 3_600_000);
    const revertedRecord = { status: 'REVERTED', revertibleUntil: future };
    expect(() => EmailChangeToken.validateForRevert(revertedRecord)).toThrow('token_already_used');
  });

  it('AC-6: revert token past revertibleUntil → token_expired', () => {
    const past = new Date(Date.now() - 1);
    const record = { status: 'APPLIED', revertibleUntil: past };
    expect(() => EmailChangeToken.validateForRevert(record)).toThrow('token_expired');
  });

  it('verify token is hashed at rest — raw token never stored', () => {
    const { rawToken, tokenHash } = EmailChangeToken.generate();
    expect(rawToken).toHaveLength(64);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).not.toBe(rawToken);
    // Verify hash is deterministic (SHA-256 of the raw token)
    expect(EmailChangeToken.hash(rawToken)).toBe(tokenHash);
  });
});
