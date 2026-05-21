import { describe, it, expect } from 'vitest';
import { EmailChangeToken } from './EmailChangeToken';

describe('EmailChangeToken', () => {
  describe('generate', () => {
    it('produces a 64-char hex rawToken and different 64-char hex hash', () => {
      const { rawToken, tokenHash } = EmailChangeToken.generate();
      expect(rawToken).toHaveLength(64);
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).not.toBe(rawToken);
    });

    it('generates unique tokens on each call', () => {
      const a = EmailChangeToken.generate();
      const b = EmailChangeToken.generate();
      expect(a.rawToken).not.toBe(b.rawToken);
    });
  });

  describe('hash', () => {
    it('is deterministic for the same input', () => {
      const raw = 'a'.repeat(64);
      expect(EmailChangeToken.hash(raw)).toBe(EmailChangeToken.hash(raw));
    });

    it('differs from the raw input', () => {
      const raw = 'a'.repeat(64);
      expect(EmailChangeToken.hash(raw)).not.toBe(raw);
    });
  });

  describe('verifyExpiry', () => {
    it('returns a date ~24h from now', () => {
      const expiry = EmailChangeToken.verifyExpiry();
      expect(expiry.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 100);
    });
  });

  describe('revertExpiry', () => {
    it('returns a date 48h after the provided date', () => {
      const base = new Date();
      const expiry = EmailChangeToken.revertExpiry(base);
      expect(expiry.getTime()).toBe(base.getTime() + 48 * 60 * 60 * 1000);
    });
  });

  describe('validateForVerify', () => {
    const future = new Date(Date.now() + 3_600_000);

    it('accepts PENDING status with future expiry', () => {
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'PENDING', expiresAt: future })
      ).not.toThrow();
    });

    it('throws token_already_used when status is APPLIED', () => {
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'APPLIED', expiresAt: future })
      ).toThrow('token_already_used');
    });

    it('throws token_already_used when status is REVERTED', () => {
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'REVERTED', expiresAt: future })
      ).toThrow('token_already_used');
    });

    it('throws token_expired when status is CANCELLED', () => {
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'CANCELLED', expiresAt: future })
      ).toThrow('token_expired');
    });

    it('throws token_expired when status is EXPIRED', () => {
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'EXPIRED', expiresAt: future })
      ).toThrow('token_expired');
    });

    it('throws token_expired when expiresAt is in the past', () => {
      const past = new Date(Date.now() - 1);
      expect(() =>
        EmailChangeToken.validateForVerify({ status: 'PENDING', expiresAt: past })
      ).toThrow('token_expired');
    });
  });

  describe('validateForRevert', () => {
    const future = new Date(Date.now() + 48 * 3_600_000);

    it('accepts APPLIED status with future revertibleUntil', () => {
      expect(() =>
        EmailChangeToken.validateForRevert({ status: 'APPLIED', revertibleUntil: future })
      ).not.toThrow();
    });

    it('throws token_already_used when status is REVERTED', () => {
      expect(() =>
        EmailChangeToken.validateForRevert({ status: 'REVERTED', revertibleUntil: future })
      ).toThrow('token_already_used');
    });

    it('throws token_not_found when status is not APPLIED', () => {
      expect(() =>
        EmailChangeToken.validateForRevert({ status: 'PENDING', revertibleUntil: future })
      ).toThrow('token_not_found');
    });

    it('throws token_expired when revertibleUntil is null', () => {
      expect(() =>
        EmailChangeToken.validateForRevert({ status: 'APPLIED', revertibleUntil: null })
      ).toThrow('token_expired');
    });

    it('throws token_expired when revertibleUntil is in the past', () => {
      const past = new Date(Date.now() - 1);
      expect(() =>
        EmailChangeToken.validateForRevert({ status: 'APPLIED', revertibleUntil: past })
      ).toThrow('token_expired');
    });
  });
});
