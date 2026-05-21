import { describe, it, expect } from 'vitest';
import { PasswordHash } from './PasswordHash';

describe('PasswordHash', () => {
  it('rejects passwords shorter than 12 characters', async () => {
    await expect(PasswordHash.create('short')).rejects.toThrow('password_too_short');
    await expect(PasswordHash.create('11character')).rejects.toThrow('password_too_short');
  });

  it('rejects passwords exceeding 72 bytes (bcrypt truncation limit)', async () => {
    const tooLong = 'a'.repeat(73);
    await expect(PasswordHash.create(tooLong)).rejects.toThrow('password_too_long');
    // 72 chars of ASCII = 72 bytes — should still be accepted
    const exactly72 = 'a'.repeat(72);
    const hash = await PasswordHash.create(exactly72);
    expect(hash.toString()).toBeTruthy();
  });

  it('accepts passwords of 12 or more characters', async () => {
    const hash = await PasswordHash.create('validpassword');
    expect(hash.toString()).toBeTruthy();
    expect(hash.toString()).not.toBe('validpassword');
  });

  it('uses bcrypt with cost >= 12 (hash prefix indicates rounds)', async () => {
    const hash = await PasswordHash.create('validpassword123');
    // bcrypt hashes start with $2b$<rounds>$ — cost 12 = $2b$12$
    expect(hash.toString()).toMatch(/^\$2[ab]\$1[2-9]\$/);
  });

  it('verifies a correct password', async () => {
    const hash = await PasswordHash.create('correcthorsebattery');
    expect(await hash.verify('correcthorsebattery')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await PasswordHash.create('correcthorsebattery');
    expect(await hash.verify('wrongpassword123456')).toBe(false);
  });

  it('can reconstruct from a stored hash string', async () => {
    const original = await PasswordHash.create('mystrongpassword');
    const fromStore = PasswordHash.fromHash(original.toString());
    expect(await fromStore.verify('mystrongpassword')).toBe(true);
  });

  it('rejects overlong passwords during verify (same 72-byte prefix must not authenticate)', async () => {
    const password = 'a'.repeat(72);
    const hash = await PasswordHash.create(password);
    // Without the guard, bcrypt silently truncates verify input to 72 bytes, making
    // a 73-char password with the same prefix incorrectly return true.
    expect(await hash.verify('a'.repeat(73))).toBe(false);
    expect(await hash.verify(password)).toBe(true);
  });
});
