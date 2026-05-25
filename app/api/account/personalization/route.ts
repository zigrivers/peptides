import { auth } from '@/lib/auth';
  import { NextResponse } from 'next/server';
  import { personalizationSchema } from '@/lib/shared/personalization';
  import { updatePersonalizationSettings } from '@/lib/shared/personalization.server';

  export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF Protection using native URL constructor
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');
    const sourceString = origin || referer || (host ? `${req.headers.get('x-forwarded-proto') || 'http'}://${host}` : null);

    if (!sourceString) {
      return NextResponse.json({ error: 'CSRF validation failed: Missing host identifiers' }, { status: 403 });
    }

    try {
      const sourceUrl = new URL(sourceString);
      let trustedHost = '';
      let trustedProto = '';

      if (process.env.NEXTAUTH_URL) {
        const trustedUrl = new URL(process.env.NEXTAUTH_URL);
        trustedHost = trustedUrl.host;
        trustedProto = trustedUrl.protocol;
      } else {
        // Fallback to request host / proxy headers in dev environments
        trustedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        trustedProto = (req.headers.get('x-forwarded-proto') || 'http') + ':';
      }

      if (sourceUrl.host !== trustedHost || sourceUrl.protocol !== trustedProto) {
        return NextResponse.json({ error: 'CSRF validation failed: Host or protocol mismatch' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'CSRF validation failed: Invalid origin or referer' }, { status: 403 });
    }

    // Parse and validate payload
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = personalizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_error' }, { status: 400 });
    }

    try {
      const updatedUser = await updatePersonalizationSettings(session.user.id, parsed.data);
      if (!updatedUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json(updatedUser);
    } catch (err) {
      console.error('[API Personalization POST] system error:', err);
      return NextResponse.json({ error: 'system_error' }, { status: 500 });
    }
  }
