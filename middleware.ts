import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe middleware: uses only the JWT-based authConfig (no Prisma imports).
// Session revocation (revokedAt check) is deferred to Task 1.4 and will require
// a lightweight edge-compatible revocation store.
const { auth } = NextAuth(authConfig);

// Exact-prefix matching: /login matches /login and /login/* but NOT /loginAdmin
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

export default auth((req: NextRequest & { auth: { user?: { id?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  if (!req.auth && !isPublicPath(pathname)) {
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
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
