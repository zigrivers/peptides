import { NextResponse } from 'next/server';

/**
 * Exposes the VAPID public key to authenticated clients so they can register
 * a Web Push subscription. The key is public by design — it identifies the
 * server to Web Push providers, but cannot be used to send messages without
 * the matching private key.
 *
 * Returns 503 when the env var is unset (dev or unconfigured CI) so the
 * client can fall back to email-only UX without throwing.
 */
export async function GET() {
  const key = process.env.WEB_PUSH_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ error: 'web_push_not_configured' }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}
