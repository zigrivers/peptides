import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';

// Edge-safe middleware: uses only the JWT-based authConfig (no Prisma imports).
// Session revocation (revokedAt check) is deferred to Task 1.4 and will require
// a lightweight edge-compatible revocation store.
const { auth } = NextAuth(authConfig);

// Exact-prefix matching: /login matches /login and /login/* but NOT /loginAdmin.
// '/' is public so middleware does not intercept it; app/page.tsx redirects based on auth.
const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/accept-invite'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

export default auth((req: NextRequest & { auth: { user?: { id?: string; status?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // ADR-015 / US-ORD-08: when DISABLE_ORDERING=true, the entire ordering
  // bounded context is inaccessible. Return 404 (not 403) so the path looks
  // like it doesn't exist — no information leak about a disabled feature.
  // This check precedes the auth redirect so anonymous and authenticated
  // requests both see 404 rather than being bounced to /login?callbackUrl=...
  if (isOrderingDisabled() && (pathname === '/ordering' || pathname.startsWith('/ordering/'))) {
    return new NextResponse(null, { status: 404 });
  }

  // Check both that a session exists AND that it carries a valid user.id.
  // Sessions without user.id occur when the JWT is missing required claims
  // (the session callback returns the base session in that case rather than throwing).
  const isAuthenticated = req.auth?.user?.id;

  // Task 6.1 — DELETION_PENDING users are restricted to /settings (where
  // the cancel banner lives) and /api/auth/* (signOut, session). Without
  // this guard, the user could log in during the 48h window and create
  // data after the export was generated; the cron would then silently
  // delete that data without it appearing in the export. The session
  // carries `status` (embedded in the JWT and surfaced by the session
  // callback in `lib/auth/auth.config.ts`), so the middleware decision
  // is made from the JWT alone — no edge-runtime DB call. Note: the
  // Node-runtime jwt callback in `lib/auth/index.ts` does refresh
  // `status` from the DB on each auth() call, so after a status change
  // the cookie updates and the next middleware pass sees the new value.
  const status = req.auth?.user?.status;
  if (
    isAuthenticated &&
    status === 'DELETION_PENDING' &&
    !pathname.startsWith('/settings') &&
    !pathname.startsWith('/api/auth')
  ) {
    // API calls return JSON 403, mirroring the unauthenticated-API handling
    // below. Only browser navigations get the /settings redirect.
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Account is scheduled for deletion' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.redirect(new URL('/settings', req.nextUrl.origin));
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    // API routes: return 401 JSON — don't redirect browsers to /login
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const loginUrl = new URL('/login', req.nextUrl.origin);
    // Preserve path + query string; validate same-origin to prevent open-redirect
    const returnPath = pathname + req.nextUrl.search;
    if (returnPath.startsWith('/') && !returnPath.startsWith('//')) {
      loginUrl.searchParams.set('callbackUrl', returnPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Exclude NextAuth internal routes (/api/auth/*), Next.js static assets,
  // and common public files (favicon, robots, manifest, PWA icons).
  // The (?:/|$) boundary on api/auth prevents /api/authz from being excluded.
  matcher: [
    '/((?!api/auth(?:/|$)|api/cron(?:/|$)|_next/static|_next/image|favicon\\.ico|robots\\.txt|manifest\\.json|sitemap\\.xml|icons/).*)',
  ],
};
