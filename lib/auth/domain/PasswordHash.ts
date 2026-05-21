import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

export class PasswordHash {
  private constructor(private readonly hash: string) {}

  static async create(plaintext: string): Promise<PasswordHash> {
    if (plaintext.length < MIN_PASSWORD_LENGTH) {
      throw new Error('password_too_short');
    }
    const hash = await bcrypt.hash(plaintext, BCRYPT_COST);
    return new PasswordHash(hash);
  }

  static fromHash(hash: string): PasswordHash {
    return new PasswordHash(hash);
  }

  async verify(plaintext: string): Promise<boolean> {
    return bcrypt.compare(plaintext, this.hash);
  }

  toString(): string {
    return this.hash;
  }
}
