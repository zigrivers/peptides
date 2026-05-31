import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-auth to prevent Vitest from attempting to resolve 'next/server' in the test environment
vi.mock('next-auth', () => ({
  default: vi.fn().mockReturnValue({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mockFindFirstUser = vi.fn();
const mockCreateAuditEvent = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: {
      findFirst: (...args: any[]) => mockFindFirstUser(...args),
    },
    auditEvent: {
      create: (...args: any[]) => mockCreateAuditEvent(...args),
    },
  },
}));

import { authOptions as rawAuthOptions } from '@/lib/auth';
const authOptions = rawAuthOptions as any;


describe('US-AUT-06: Google Sign-In & Registration Acceptance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signIn Callback (Security & Verification Guards)', () => {
    it('allows sign-in for verified Google account of existing active user', async () => {
      mockFindFirstUser.mockResolvedValue({ status: 'ACTIVE' });

      const user = { email: 'active@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: true };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(true);
      expect(mockFindFirstUser).toHaveBeenCalledWith({
        where: { email: 'active@example.com' },
        select: { status: true },
      });
    });

    it('allows sign-in/up for verified Google account of new user (not in DB)', async () => {
      mockFindFirstUser.mockResolvedValue(null);

      const user = { email: 'new@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: true };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(true);
    });

    it('blocks sign-in if Google email is not verified', async () => {
      const user = { email: 'unverified@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: false };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(false);
      expect(mockFindFirstUser).not.toHaveBeenCalled();
    });

    it('blocks sign-in for existing user with SUSPENDED status', async () => {
      mockFindFirstUser.mockResolvedValue({ status: 'SUSPENDED' });

      const user = { email: 'suspended@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: true };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(false);
    });

    it('allows sign-in for existing user with DELETION_PENDING status', async () => {
      mockFindFirstUser.mockResolvedValue({ status: 'DELETION_PENDING' });

      const user = { email: 'pending-del@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: true };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(true);
    });

    it('skips database status checks for other providers (e.g., credentials)', async () => {
      const user = { email: 'cred@example.com' };
      const account = { provider: 'credentials' };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
      } as any);

      expect(allowed).toBe(true);
      expect(mockFindFirstUser).not.toHaveBeenCalled();
    });

    it('fails closed (returns false) if the database status check throws an exception', async () => {
      mockFindFirstUser.mockRejectedValue(new Error('DB Connection Failure'));

      const user = { email: 'db-fail@example.com' };
      const account = { provider: 'google' };
      const profile = { email_verified: true };

      const allowed = await authOptions.callbacks.signIn({
        user,
        account,
        profile,
      } as any);

      expect(allowed).toBe(false);
    });
  });

  describe('NextAuth Events (Audit Logging)', () => {
    it('creates USER_REGISTERED and USER_LOGGED_IN events for new Google registration', async () => {
      mockCreateAuditEvent.mockResolvedValue({});

      const user = { id: 'u-new', email: 'new-oauth@example.com' };
      const account = { provider: 'google' };

      await authOptions.events.signIn({
        user,
        account,
        isNewUser: true,
      } as any);

      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(2);

      // Verify registration audit event
      expect(mockCreateAuditEvent).toHaveBeenNthCalledWith(1, {
        data: {
          actorUserId: 'u-new',
          subjectUserId: 'u-new',
          category: 'Auth',
          action: 'USER_REGISTERED',
          resourceId: 'u-new',
          resourceType: 'User',
          metadata: { method: 'google' },
        },
      });

      // Verify login audit event
      expect(mockCreateAuditEvent).toHaveBeenNthCalledWith(2, {
        data: {
          actorUserId: 'u-new',
          subjectUserId: 'u-new',
          category: 'Auth',
          action: 'USER_LOGGED_IN',
          resourceId: 'u-new',
          resourceType: 'User',
          metadata: { method: 'google' },
        },
      });
    });

    it('creates only USER_LOGGED_IN event for existing user logging in', async () => {
      mockCreateAuditEvent.mockResolvedValue({});

      const user = { id: 'u-existing', email: 'existing@example.com' };
      const account = { provider: 'google' };

      await authOptions.events.signIn({
        user,
        account,
        isNewUser: false,
      } as any);

      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateAuditEvent).toHaveBeenCalledWith({
        data: {
          actorUserId: 'u-existing',
          subjectUserId: 'u-existing',
          category: 'Auth',
          action: 'USER_LOGGED_IN',
          resourceId: 'u-existing',
          resourceType: 'User',
          metadata: { method: 'google' },
        },
      });
    });

    it('creates OAUTH_ACCOUNT_LINKED event when user links their Google account', async () => {
      mockCreateAuditEvent.mockResolvedValue({});

      const user = { id: 'u-link' };
      const account = { provider: 'google' };

      await authOptions.events.linkAccount({
        user,
        account,
      } as any);

      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateAuditEvent).toHaveBeenCalledWith({
        data: {
          actorUserId: 'u-link',
          subjectUserId: 'u-link',
          category: 'Auth',
          action: 'OAUTH_ACCOUNT_LINKED',
          resourceId: 'u-link',
          resourceType: 'User',
          metadata: { provider: 'google' },
        },
      });
    });

    it('creates USER_LOGGED_OUT audit event when signing out', async () => {
      mockCreateAuditEvent.mockResolvedValue({});

      const token = { id: 'u-logout' };

      await authOptions.events.signOut({
        token,
      } as any);

      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateAuditEvent).toHaveBeenCalledWith({
        data: {
          actorUserId: 'u-logout',
          subjectUserId: 'u-logout',
          category: 'Auth',
          action: 'USER_LOGGED_OUT',
          resourceId: 'u-logout',
          resourceType: 'User',
        },
      });
    });

    it('fails open (swallows exceptions silently) if database audit log creation fails during events', async () => {
      mockCreateAuditEvent.mockRejectedValue(new Error('Audit DB Down'));
      
      const user = { id: 'u-fail', email: 'audit-fail@example.com' };
      const account = { provider: 'google' };

      // Should not throw or crash
      await expect(
        authOptions.events.signIn({
          user,
          account,
          isNewUser: true,
        } as any)
      ).resolves.not.toThrow();
    });
  });
});
