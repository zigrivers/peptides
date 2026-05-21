import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

// Run in Node.js runtime so the Prisma-backed auth can access the database
// for session revocation checks (implemented in Task 1.4).
export const runtime = 'nodejs';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export default auth(async (req: NextRequest & { auth: Session | null }) => {
  const { pathname } = req.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (!req.auth && !isPublicRoute) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    // Validate callbackUrl to prevent open-redirect attacks — only allow same-origin paths
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
