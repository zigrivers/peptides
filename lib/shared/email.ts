import { Resend } from 'resend';

// Lazy proxy: defer Resend instantiation until first use so importing this
// module during build-time page data collection (when env vars may be absent)
// does not throw "Missing API key". Routes that import this module transitively
// — e.g. /api/cron/pending-deletions — are evaluated by Next.js during build
// even if they aren't called, which used to fail CI when RESEND_API_KEY wasn't
// set in the build environment.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    const instance = getResend();
    const value = Reflect.get(instance, prop);
    // Bind methods to the instance so `this` doesn't point at the Proxy if
    // someone calls a top-level method directly (e.g. `resend.someMethod()`).
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const FROM_ADDRESS = 'noreply@peptides.app';
