import { describe, it, expect } from 'vitest';
import { encryptSession, decryptSession } from './SessionManager';

const TEST_KEY = 'a'.repeat(64); // 32-byte hex key for testing

describe('SessionManager', () => {
  describe('encryptSession / decryptSession', () => {
    it('round-trips a session string', () => {
      const plaintext = '1ABC_TelegramSessionStringHere';
      const ciphertext = encryptSession(plaintext, TEST_KEY);
      expect(ciphertext).not.toBe(plaintext);
      expect(decryptSession(ciphertext, TEST_KEY)).toBe(plaintext);
    });

    it('produces unique ciphertexts for the same input (random IV)', () => {
      const plaintext = 'same-session-string';
      const ct1 = encryptSession(plaintext, TEST_KEY);
      const ct2 = encryptSession(plaintext, TEST_KEY);
      expect(ct1).not.toBe(ct2);
    });

    it('throws on tampered ciphertext (GCM auth tag)', () => {
      const ct = encryptSession('session', TEST_KEY);
      const buf = Buffer.from(ct, 'base64');
      buf[buf.length - 1] ^= 0xff; // flip last byte
      expect(() => decryptSession(buf.toString('base64'), TEST_KEY)).toThrow();
    });

    it('throws when key is wrong', () => {
      const ct = encryptSession('session', TEST_KEY);
      const wrongKey = 'b'.repeat(64);
      expect(() => decryptSession(ct, wrongKey)).toThrow();
    });

    it('throws when TELEGRAM_SESSION_KEY env var is missing', () => {
      const original = process.env.TELEGRAM_SESSION_KEY;
      delete process.env.TELEGRAM_SESSION_KEY;
      try {
        expect(() => encryptSession('session')).toThrow('TELEGRAM_SESSION_KEY');
      } finally {
        process.env.TELEGRAM_SESSION_KEY = original;
      }
    });

    it('uses TELEGRAM_SESSION_KEY env var when no key arg is supplied', () => {
      process.env.TELEGRAM_SESSION_KEY = TEST_KEY;
      const ct = encryptSession('session');
      expect(decryptSession(ct)).toBe('session');
    });
  });
});
