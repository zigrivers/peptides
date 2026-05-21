import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function resolveKey(keyHex?: string): Buffer {
  const raw = keyHex ?? process.env.TELEGRAM_SESSION_KEY;
  if (!raw) throw new Error('TELEGRAM_SESSION_KEY is not set');
  // Accept 64-char hex (32 bytes) or any string; hash non-hex strings to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  // Derive 32 bytes via SHA-256 so arbitrary-length strings work.
  return createHash('sha256').update(raw).digest();
}

export function encryptSession(plaintext: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSession(ciphertext: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
