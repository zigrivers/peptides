import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { authConfig } from '@/lib/auth/auth.config';

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));

beforeEach(() => {
  vi.clearAllMocks();
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({ user: { update: mockUserUpdate } })
  );
});

const { getOnboardingState, advanceOnboardingStep, dismissOnboarding } = await import(
  '@/lib/auth/application/onboarding'
);

/**
 * Story: US-AUT-01 - Onboarding Path
 */
describe('US-AUT-01: Onboarding Path', () => {
  describe('getOnboardingState', () => {
    it('AC-1: returns initial browse_catalog step for new power user with no onboardingState', async () => {
      mockUserFindUnique.mockResolvedValue({ onboardingState: null, role: 'POWER_USER' });
      const state = await getOnboardingState('u-1');
      expect(state?.step).toBe('browse_catalog');
    });

    it('AC-2: returns initial view_schedule step for new managed user', async () => {
      mockUserFindUnique.mockResolvedValue({ onboardingState: null, role: 'MANAGED_USER' });
      const state = await getOnboardingState('u-1');
      expect(state?.step).toBe('view_schedule');
    });

    it('returns existing onboarding state when already set', async () => {
      const existing = { step: 'create_protocol', dismissed: false };
      mockUserFindUnique.mockResolvedValue({ onboardingState: existing, role: 'POWER_USER' });
      const state = await getOnboardingState('u-1');
      expect(state?.step).toBe('create_protocol');
    });

    it('returns null when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      expect(await getOnboardingState('no-such-user')).toBeNull();
    });
  });

  describe('advanceOnboardingStep', () => {
    it('AC-1: advances power user to next step', async () => {
      mockUserUpdate.mockResolvedValue({});
      await advanceOnboardingStep('u-1', 'create_protocol');
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { onboardingState: { step: 'create_protocol', dismissed: false } },
      });
    });

    it('stamps completedAt when step is completed', async () => {
      mockUserUpdate.mockResolvedValue({});
      await advanceOnboardingStep('u-1', 'completed');
      const call = mockUserUpdate.mock.calls[0][0];
      expect(call.data.onboardingState.completedAt).toBeDefined();
      expect(call.data.onboardingState.step).toBe('completed');
    });
  });

  describe('dismissOnboarding', () => {
    it('sets dismissed = true preserving step', async () => {
      mockUserFindUnique.mockResolvedValue({ onboardingState: { step: 'telegram_setup', dismissed: false }, role: 'POWER_USER' });
      mockUserUpdate.mockResolvedValue({});
      await dismissOnboarding('u-1');
      const call = mockUserUpdate.mock.calls[0][0];
      expect(call.data.onboardingState.dismissed).toBe(true);
      expect(call.data.onboardingState.step).toBe('telegram_setup');
    });
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
 * AC-1: 12-char minimum password
 * AC-2: httpOnly rolling-expiry session cookies
 */
describe('US-AUT-03: User Registration and Login', () => {
  it('AC-1: requires 12-character minimum password', async () => {
    await expect(PasswordHash.create('short')).rejects.toThrow('password_too_short');
    await expect(PasswordHash.create('11character')).rejects.toThrow('password_too_short');
    // Exactly 12 chars: accepted
    const hash = await PasswordHash.create('exactly12chr');
    expect(hash.toString()).toMatch(/^\$2[ab]\$/);
  });

  it('AC-2: uses httpOnly session cookies with 30-day rolling expiry', () => {
    // Strategy: 'jwt' — signed JWT stored in an httpOnly cookie (no DB per request).
    // Credentials provider requires jwt strategy in Auth.js v5 beta.
    expect(authConfig.session.strategy).toBe('jwt');
    expect(authConfig.session.maxAge).toBe(30 * 24 * 60 * 60);
    expect(authConfig.cookies?.sessionToken?.options?.httpOnly).toBe(true);
    expect(authConfig.cookies?.sessionToken?.options?.sameSite).toBe('lax');
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
