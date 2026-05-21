import { describe, it, expect } from 'vitest';
import { PasswordResetToken } from './PasswordResetToken';

const makeRecord = (overrides?: Partial<Parameters<typeof PasswordResetToken.validate>[0]>) => ({
  id: 'test-id',
  userId: 'user-1',
  tokenHash: 'abc',
  expiresAt: new Date(Date.now() + 30_000),
  used: false,
  ...overrides,
});

describe('PasswordResetToken.generate', () => {
  it('returns a 64-char hex rawToken and a 64-char hex tokenHash', () => {
    const { rawToken, tokenHash } = PasswordResetToken.generate();
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rawToken and tokenHash differ', () => {
    const { rawToken, tokenHash } = PasswordResetToken.generate();
    expect(rawToken).not.toBe(tokenHash);
  });

  it('each call produces a unique rawToken', () => {
    const first = PasswordResetToken.generate().rawToken;
    const second = PasswordResetToken.generate().rawToken;
    expect(first).not.toBe(second);
  });

  it('hashing the rawToken with hash() reproduces the tokenHash', () => {
    const { rawToken, tokenHash } = PasswordResetToken.generate();
    expect(PasswordResetToken.hash(rawToken)).toBe(tokenHash);
  });
});

describe('PasswordResetToken.expiry', () => {
  it('returns a date approximately 1 hour in the future', () => {
    const before = Date.now();
    const exp = PasswordResetToken.expiry();
    const after = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    expect(exp.getTime()).toBeGreaterThanOrEqual(before + oneHourMs - 10);
    expect(exp.getTime()).toBeLessThanOrEqual(after + oneHourMs + 10);
  });
});

describe('PasswordResetToken.validate', () => {
  it('does not throw for a valid unused non-expired record', () => {
    expect(() => PasswordResetToken.validate(makeRecord())).not.toThrow();
  });

  it('throws token_already_used for a used record', () => {
    expect(() => PasswordResetToken.validate(makeRecord({ used: true }))).toThrow(
      'token_already_used'
    );
  });

  it('throws token_expired for an expired record', () => {
    const past = new Date(Date.now() - 1000);
    expect(() => PasswordResetToken.validate(makeRecord({ expiresAt: past }))).toThrow(
      'token_expired'
    );
  });

  it('used check takes precedence over expiry check', () => {
    const past = new Date(Date.now() - 1000);
    expect(() =>
      PasswordResetToken.validate(makeRecord({ used: true, expiresAt: past }))
    ).toThrow('token_already_used');
  });
});
