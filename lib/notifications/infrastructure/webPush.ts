import type * as WebPushNs from 'web-push';

/**
 * Lazy web-push transport wrapper. Mirrors the Resend lazy-init pattern in
 * `lib/shared/email.ts` so importing this module during Next.js build-time
 * page data collection doesn't require VAPID env vars to be present.
 *
 * Returns a structured result instead of throwing so the dispatcher can
 * distinguish expired subscriptions (404 / 410 — prune the row) from
 * transient errors (5xx — keep the row, try next tick).
 */

const VAPID_SUBJECT = 'mailto:noreply@peptides.app';

interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: WebPushNs.PushSubscription,
    payload: string,
    options?: WebPushNs.RequestOptions
  ) => Promise<WebPushNs.SendResult>;
}

let _client: WebPushModule | null = null;
let _initError: Error | null = null;

async function getClient(): Promise<WebPushModule> {
  if (_initError) throw _initError;
  if (_client) return _client;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    _initError = new Error('web_push_not_configured');
    throw _initError;
  }
  // Dynamic import so the dep is not pulled in by the bundler for routes
  // that don't actually push (e.g. /settings page render). `web-push` is a
  // CommonJS module, so under Next/Vitest's ESM runtime its exports may be
  // wrapped under `.default` — normalise both shapes.
  const imported = (await import('web-push')) as unknown as
    | WebPushModule
    | { default: WebPushModule };
  const mod = (
    (imported as { default?: WebPushModule }).default ?? (imported as WebPushModule)
  );
  if (typeof mod.setVapidDetails !== 'function' || typeof mod.sendNotification !== 'function') {
    _initError = new Error('web_push_module_shape_unexpected');
    throw _initError;
  }
  mod.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  _client = mod;
  return _client;
}

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface WebPushSendResult {
  ok: boolean;
  /** Subscription is dead — prune from DB (404 / 410). */
  expired: boolean;
  error?: string;
  statusCode?: number;
}

export async function sendWebPush(
  target: WebPushTarget,
  payload: WebPushPayload
): Promise<WebPushSendResult> {
  let client: WebPushModule;
  try {
    client = await getClient();
  } catch (err) {
    return { ok: false, expired: false, error: (err as Error).message };
  }

  try {
    await client.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true, expired: false };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined;
    const expired = statusCode === 404 || statusCode === 410;
    return {
      ok: false,
      expired,
      error: e.message ?? 'web_push_send_failed',
      statusCode,
    };
  }
}

/** Test-only: reset the cached client. Avoid using in production code. */
export function __resetWebPushClientForTesting(): void {
  _client = null;
  _initError = null;
}
