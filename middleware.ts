import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export default auth(async (req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (!req.auth && !isPublicRoute) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
