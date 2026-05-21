import { unstable_after as after } from 'next/server';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { AuthRepository } from '@/lib/auth/infrastructure/AuthRepository';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { prisma } from '@/lib/shared/prisma';

// Minimum response time for both found and not-found paths.
// Only the user lookup and the timing floor run before the response boundary.
// All found-path heavy work (token creation, audit, email send) is deferred
// via unstable_after so neither DB write latency nor Resend latency can reveal
// whether an email address is registered (US-AUT-04 AC-2 no-enumeration contract).
const MIN_RESPONSE_MS = 500;

/**
 * US-AUT-04 AC-2: Always returns void — never reveals whether the email is registered.
 * If the user exists, a hashed single-use 1h token is created and an email is sent.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Collect found user inside Promise.all; heavy work deferred to after().
  // Array avoids TypeScript's closure-assignment tracking limitation on let variables.
  const foundUsers: Array<{ id: string; email: string }> = [];

  await Promise.all([
    new Promise<void>((resolve) => setTimeout(resolve, MIN_RESPONSE_MS)),
    (async () => {
      const user = await AuthRepository.findByEmailForAuth(normalizedEmail);
      if (!user) {
        // Burn equivalent CPU work so this branch matches the found-path hash computation.
        PasswordResetToken.generate();
        return;
      }
      foundUsers.push({ id: user.id, email: user.email });
    })(),
  ]);

  // All found-path work is deferred via after() so the response boundary is the
  // same for registered and unregistered addresses — timing is indistinguishable.
  if (foundUsers.length > 0) {
    const user = foundUsers[0]!;
    after(async () => {
      const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
      if (!appUrl) {
        console.error('[requestPasswordReset] APP_URL_NOT_CONFIGURED');
        return;
      }

      const rawToken = await withAudit(
        (tx) => PasswordResetRepo.create(tx, user.id),
        {
          actorUserId: user.id,
          category: 'Auth',
          action: 'PASSWORD_RESET_REQUESTED',
          resourceId: user.id,
          resourceType: 'User',
        },
        prisma
      );

      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
      const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
      });
      if (error) console.error('[requestPasswordReset] email send failed:', error.message);
    });
  }
}
