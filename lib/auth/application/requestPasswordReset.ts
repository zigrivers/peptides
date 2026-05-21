import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { AuthRepository } from '@/lib/auth/infrastructure/AuthRepository';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { withAudit } from '@/lib/audit/application/withAudit';

/**
 * US-AUT-04 AC-2: Always returns void — never reveals whether the email is registered.
 * If the user exists, a hashed single-use 1h token is created and an email is sent.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await AuthRepository.findByEmailForAuth(normalizedEmail);

  // Always exit without error — prevents email enumeration.
  if (!user) return;

  await withAudit(
    async (tx) => {
      const rawToken = await PasswordResetRepo.create(tx, user.id);
      const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${rawToken}`;

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
      });

      return rawToken;
    },
    {
      actorUserId: user.id,
      category: 'Auth',
      action: 'PASSWORD_RESET_REQUESTED',
      resourceId: user.id,
      resourceType: 'User',
    }
  );
}
