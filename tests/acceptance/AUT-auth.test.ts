import { describe, it } from 'vitest';

/**
 * Story: US-AUT-01 - Onboarding Path
 */
describe('US-AUT-01: Onboarding Path', () => {
  it.todo('AC-1: guides power user through 3-step setup', () => {
    // Hint: check OnboardingState domain model
  });

  it.todo('AC-2: guides managed user through dose logging walkthrough', () => {
    // Hint: check app/(auth)/onboarding/page.tsx
  });
});

/**
 * Story: US-AUT-02 - Deletion and Export
 */
describe('US-AUT-02: Deletion and Export', () => {
  it.todo('AC-1: generates JSON and CSV export of all logs', () => {
    // Hint: check lib/auth/application/ExportService
  });

  it.todo('AC-2: wipes all data after 48-hour delay', () => {
    // Hint: assert Protocol and DoseLog records are deleted
  });
});

/**
 * Story: US-AUT-03 - User Registration and Login
 */
describe('US-AUT-03: User Registration and Login', () => {
  it('requires 12-character minimum password', async () => {
    // const result = await register({ email: 'test@example.com', password: 'short' });
    // expect(result.error).toBe('password_too_short');
  });

  it('uses secure httpOnly cookies with rolling expiry', () => {
    // expect(authConfig.session.strategy).toBe('jwt');
  });
});

/**
 * Story: US-AUT-05 - PWA & Offline Support
 */
describe('US-AUT-05: PWA & Offline Support', () => {
  it.todo('AC-1: provides manifest for home screen installation', () => {
    // Hint: assert existence of public/manifest.json
  });

  it.todo('AC-2: loads app shell instantly without connection', () => {
    // Hint: Playwright E2E with page.setOffline(true)
  });
});
