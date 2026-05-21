import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;
// bcrypt silently truncates inputs beyond 72 bytes, which can cause two different
// passwords to produce the same hash. Reject before hashing.
const MAX_PASSWORD_BYTES = 72;

export class PasswordHash {
  private constructor(private readonly hash: string) {}

  static async create(plaintext: string): Promise<PasswordHash> {
    if (plaintext.length < MIN_PASSWORD_LENGTH) {
      throw new Error('password_too_short');
    }
    if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new Error('password_too_long');
    }
    const hash = await bcrypt.hash(plaintext, BCRYPT_COST);
    return new PasswordHash(hash);
  }

  static fromHash(hash: string): PasswordHash {
    return new PasswordHash(hash);
  }

  async verify(plaintext: string): Promise<boolean> {
    // Mirror the MAX_PASSWORD_BYTES guard from create() — bcrypt silently truncates
    // inputs beyond 72 bytes, so an overlong input with the same 72-byte prefix as
    // the stored password would incorrectly return true without this check.
    if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) {
      return false;
    }
    return bcrypt.compare(plaintext, this.hash);
  }

  toString(): string {
    return this.hash;
  }
}
