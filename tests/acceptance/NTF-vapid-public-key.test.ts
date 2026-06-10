import { describe, expect, it, afterEach } from 'vitest';

const { GET } = await import('@/app/api/notifications/vapid-public-key/route');

describe('GET /api/notifications/vapid-public-key', () => {
  const originalPublicKey = process.env.WEB_PUSH_PUBLIC_KEY;

  afterEach(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = originalPublicKey;
  });

  it('returns 200 with configured=false when web push is not configured', async () => {
    delete process.env.WEB_PUSH_PUBLIC_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ configured: false, publicKey: null });
  });

  it('returns the public key when web push is configured', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'public-key';

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ configured: true, publicKey: 'public-key' });
  });
});
