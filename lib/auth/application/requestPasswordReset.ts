import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { AuthRepository } from '@/lib/auth/infrastructure/AuthRepository';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { prisma } from '@/lib/shared/prisma';

/**
 * US-AUT-04 AC-2: Always returns void — never reveals whether the email is registered.
 * If the user exists, a hashed single-use 1h token is created and an email is sent.
 *
 * F-005: resend.emails.send is called AFTER the DB transaction so a slow/unavailable
 * email API cannot hold the connection pool open.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await AuthRepository.findByEmailForAuth(normalizedEmail);

  if (!user) {
    // Constant-time guard: perform equivalent token-generation work regardless of outcome.
    // Prevents timing-based enumeration for the token-generation phase.
    // The Resend API latency on the success path is masked by rate limiting
    // (5 req/hour/email per docs/api-contracts.md §9).
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

  // Email sent outside the transaction (F-005).
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
  if (!appUrl) throw new Error('APP_URL_NOT_CONFIGURED');
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: 'Reset your password',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  });
  if (error) throw new Error(`EMAIL_SEND_FAILED: ${error.message}`);
}
