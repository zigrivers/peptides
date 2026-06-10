import { describe, expect, it } from 'vitest';

import { getGoogleOAuthCredentials, isGoogleOAuthConfigured } from './googleOAuth';

describe('Google OAuth configuration', () => {
  it('returns null when either Google OAuth credential is missing', () => {
    expect(getGoogleOAuthCredentials({})).toBeNull();
    expect(getGoogleOAuthCredentials({ GOOGLE_CLIENT_ID: 'id' })).toBeNull();
    expect(getGoogleOAuthCredentials({ GOOGLE_CLIENT_SECRET: 'secret' })).toBeNull();
  });

  it('supports explicit GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET variables', () => {
    expect(
      getGoogleOAuthCredentials({
        GOOGLE_CLIENT_ID: 'google-id',
        GOOGLE_CLIENT_SECRET: 'google-secret',
      })
    ).toEqual({ clientId: 'google-id', clientSecret: 'google-secret' });
  });

  it('supports Auth.js AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET variables', () => {
    expect(
      getGoogleOAuthCredentials({
        AUTH_GOOGLE_ID: 'authjs-id',
        AUTH_GOOGLE_SECRET: 'authjs-secret',
      })
    ).toEqual({ clientId: 'authjs-id', clientSecret: 'authjs-secret' });
  });

  it('reports configured only when both credential values are present', () => {
    expect(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: 'id' })).toBe(false);
    expect(
      isGoogleOAuthConfigured({
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
      })
    ).toBe(true);
  });
});
