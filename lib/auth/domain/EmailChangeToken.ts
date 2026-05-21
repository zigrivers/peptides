import crypto from 'crypto';

export interface EmailChangeRecord {
  id: string;
  userId: string;
  oldEmail: string;
  newEmail: string;
  createdAt: Date;
  expiresAt: Date;
  status: string;
  verifiedAt: Date | null;
  appliedAt: Date | null;
  revertibleUntil: Date | null;
}

export const EmailChangeToken = {
  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  },

  hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  verifyExpiry(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  },

  revertExpiry(fromDate: Date): Date {
    return new Date(fromDate.getTime() + 48 * 60 * 60 * 1000);
  },

  validateForVerify(record: Pick<EmailChangeRecord, 'status' | 'expiresAt'>): void {
    if (record.status === 'APPLIED' || record.status === 'REVERTED') {
      throw new Error('token_already_used');
    }
    if (record.status === 'CANCELLED' || record.status === 'EXPIRED') {
      throw new Error('token_expired');
    }
    if (record.expiresAt < new Date()) {
      throw new Error('token_expired');
    }
  },

  validateForRevert(record: Pick<EmailChangeRecord, 'status' | 'revertibleUntil'>): void {
    if (record.status === 'REVERTED') {
      throw new Error('token_already_used');
    }
    // Intentionally returns token_not_found (not token_expired) for PENDING/CANCELLED/EXPIRED:
    // the revert link is sent to the OLD address owner; leaking that the token exists but
    // is in a different terminal state would not help a legitimate user and could help an attacker.
    if (record.status !== 'APPLIED') {
      throw new Error('token_not_found');
    }
    if (!record.revertibleUntil || record.revertibleUntil < new Date()) {
      throw new Error('token_expired');
    }
  },
};
