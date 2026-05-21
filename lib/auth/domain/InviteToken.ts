import crypto from 'crypto';

export const INVITE_EXPIRY_MS = 72 * 3_600_000; // 72 hours

export interface InviteRecord {
  status: string;
  expiresAt: Date;
}

export const InviteToken = {
  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  },

  async hash(rawToken: string): Promise<string> {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  // Only PENDING invites may be accepted. ACCEPTED and REVOKED are terminal;
  // any other unexpected status is also rejected to prevent future status values
  // from being silently accepted.
  validateForAccept(record: InviteRecord): void {
    if (record.status === 'ACCEPTED') throw new Error('invite_already_used');
    if (record.status !== 'PENDING') throw new Error('invite_revoked');
    if (record.expiresAt <= new Date()) throw new Error('invite_expired');
  },
};
