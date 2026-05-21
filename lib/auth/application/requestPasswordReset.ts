import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { AuthRepository } from '@/lib/auth/infrastructure/AuthRepository';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { prisma } from '@/lib/shared/prisma';

// Minimum response time for both found and not-found paths.
// DB operations and the delay run in Promise.all so the caller always waits at
// least MIN_RESPONSE_MS. Email send happens AFTER Promise.all resolves so that
// Resend latency cannot create a timing oracle distinguishing registered from
// unregistered addresses (US-AUT-04 AC-2 no-enumeration contract).
const MIN_RESPONSE_MS = 500;

/**
 * US-AUT-04 AC-2: Always returns void — never reveals whether the email is registered.
 * If the user exists, a hashed single-use 1h token is created and an email is sent.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Captured inside Promise.all; executed outside it so email latency is invisible.
  // Array avoids TypeScript's closure-assignment tracking limitation on let variables.
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

      // Schedule email send outside the timing boundary — not executed until after
      // Promise.all resolves so Resend latency cannot leak account existence.
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

  // Fire email after the uniform response boundary — intentionally not awaited so
  // Resend latency cannot extend the user-visible response time (no-enumeration contract).
  for (const send of emailQueue) {
    send().catch((err: unknown) => console.error('[requestPasswordReset] email error:', err));
  }
}
