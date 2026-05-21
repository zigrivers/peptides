import crypto from 'crypto';

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

  validateForAccept(record: InviteRecord): void {
    if (record.status === 'ACCEPTED') throw new Error('invite_already_used');
    if (record.status === 'REVOKED') throw new Error('invite_revoked');
    if (record.expiresAt <= new Date()) throw new Error('invite_expired');
  },
};
