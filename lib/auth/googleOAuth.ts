type Env = Record<string, string | undefined>;

interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}

export function getGoogleOAuthCredentials(env: Env = process.env): GoogleOAuthCredentials | null {
  const clientId = firstPresent(env.GOOGLE_CLIENT_ID, env.AUTH_GOOGLE_ID);
  const clientSecret = firstPresent(env.GOOGLE_CLIENT_SECRET, env.AUTH_GOOGLE_SECRET);

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(env: Env = process.env): boolean {
  return getGoogleOAuthCredentials(env) !== null;
}
