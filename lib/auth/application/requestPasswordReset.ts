import { unstable_after as after } from 'next/server';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { AuthRepository } from '@/lib/auth/infrastructure/AuthRepository';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { prisma } from '@/lib/shared/prisma';

// Minimum response time for both found and not-found paths.
// DB operations and the delay run in Promise.all so the caller always waits at
// least MIN_RESPONSE_MS. Email send is deferred via unstable_after so that Resend
// latency cannot create a timing oracle distinguishing registered from unregistered
// addresses (US-AUT-04 AC-2 no-enumeration contract) while still guaranteeing
// delivery within the serverless function lifecycle.
const MIN_RESPONSE_MS = 500;

/**
 * US-AUT-04 AC-2: Always returns void — never reveals whether the email is registered.
 * If the user exists, a hashed single-use 1h token is created and an email is sent.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Captured inside Promise.all; executed via unstable_after outside it so email
  // latency cannot extend the user-visible response time.
  const emailQueue: Array<() => Promise<void>> = [];

  await Promise.all([
    new Promise<void>((resolve) => setTimeout(resolve, MIN_RESPONSE_MS)),
    (async () => {
      const user = await AuthRepository.findByEmailForAuth(normalizedEmail);

      if (!user) {
        // Burn equivalent CPU work so this branch matches the found-path hash computation.
        PasswordResetToken.generate();
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

      const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
      if (!appUrl) throw new Error('APP_URL_NOT_CONFIGURED');
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      // Enqueue email send — executed via unstable_after after the response boundary.
      emailQueue.push(async () => {
        const { error } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: user.email,
          subject: 'Reset your password',
          html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
        });
        if (error) console.error('[requestPasswordReset] email send failed:', error.message);
      });
    })(),
  ]);

  // Schedule email delivery after the uniform response boundary via Next.js unstable_after.
  // This guarantees execution within the serverless function lifecycle while keeping
  // Resend latency invisible to the caller (no timing oracle on account existence).
  for (const send of emailQueue) {
    after(send);
  }
}
