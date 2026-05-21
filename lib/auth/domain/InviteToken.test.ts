import { describe, it, expect } from 'vitest';
import { InviteToken } from './InviteToken';

describe('InviteToken', () => {
  it('generates a cryptographically random raw token', () => {
    const t1 = InviteToken.generate();
    const t2 = InviteToken.generate();
    expect(t1.rawToken).not.toBe(t2.rawToken);
    expect(t1.rawToken.length).toBeGreaterThan(20);
  });

  it('stores the SHA-256 hash of the raw token', async () => {
    const { rawToken, tokenHash } = InviteToken.generate();
    const expected = await InviteToken.hash(rawToken);
    expect(tokenHash).toBe(expected);
  });

  it('hash is deterministic for same input', async () => {
    const h1 = await InviteToken.hash('abc123');
    const h2 = await InviteToken.hash('abc123');
    expect(h1).toBe(h2);
  });

  it('validates a non-expired PENDING record', () => {
    expect(() =>
      InviteToken.validateForAccept({
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    ).not.toThrow();
  });

  it('throws invite_expired when expiresAt is in the past', () => {
    expect(() =>
      InviteToken.validateForAccept({
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
      })
    ).toThrow('invite_expired');
  });

  it('throws invite_already_used when status is ACCEPTED', () => {
    expect(() =>
      InviteToken.validateForAccept({
        status: 'ACCEPTED',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    ).toThrow('invite_already_used');
  });

  it('throws invite_revoked when status is REVOKED', () => {
    expect(() =>
      InviteToken.validateForAccept({
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    ).toThrow('invite_revoked');
  });
});
