import crypto from 'crypto';

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
}

export const PasswordResetToken = {
  /** Generates a cryptographically random 32-byte token and its SHA-256 hash. */
  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  },

  /** Computes the SHA-256 hash of a raw token (for lookup by raw value from email link). */
  hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  /** Returns an expiry date 1 hour from now. */
  expiry(): Date {
    return new Date(Date.now() + 60 * 60 * 1000);
  },

  validate(record: PasswordResetTokenRecord): void {
    if (record.used) {
      throw new Error('token_already_used');
    }
    if (record.expiresAt < new Date()) {
      throw new Error('token_expired');
    }
  },
};
