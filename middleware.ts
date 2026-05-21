import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe middleware: uses only the JWT-based authConfig (no Prisma imports).
// Session revocation (revokedAt check) is deferred to Task 1.4 and will require
// a lightweight edge-compatible approach (Upstash/KV revocation list).
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export default auth((req: NextRequest & { auth: { user?: { id?: string } } | null }) => {
  const { pathname } = req.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (!req.auth && !isPublicRoute) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    // Only embed same-origin paths to prevent open-redirect attacks
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
