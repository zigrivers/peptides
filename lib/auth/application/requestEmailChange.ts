import { unstable_after as after } from 'next/server';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { prisma } from '@/lib/shared/prisma';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { EmailChangeRepo } from '@/lib/auth/infrastructure/EmailChangeRepo';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface RequestEmailChangeInput {
  userId: string;
  currentPassword: string;
  newEmail: string;
}

/**
 * US-AUT-07 AC-1–3: Validates current password, checks new email for conflicts
 * (without leaking ownership), creates a 24h verify token, and sends a verification
 * email to the new address.
 */
export async function requestEmailChange(input: RequestEmailChangeInput): Promise<void> {
  const { userId, currentPassword, newEmail } = input;

  // Current-password gate (AC-1)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user?.passwordHash) throw new Error('user_not_found');

  const hash = PasswordHash.fromHash(user.passwordHash);
  const isValid = await hash.verify(currentPassword);
  if (!isValid) throw new Error('current_password_invalid');

  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    throw new Error('email_same_as_current');
  }

  // Conflict check — AC-3: case-insensitive; same error regardless of ownership
  const existing = await prisma.user.findFirst({
    where: { email: { equals: newEmail, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new Error('email_already_in_use');

  const oldEmail = user.email;

  const rawToken = await withAudit(
    async (tx) => {
      // Cancel any existing PENDING tokens so there is at most one in flight per user
      await EmailChangeRepo.cancelPending(tx, userId);
      return EmailChangeRepo.create(tx, userId, oldEmail, newEmail);
    },
    {
      actorUserId: userId,
      category: 'Auth',
      action: 'EMAIL_CHANGE_REQUESTED',
      resourceId: userId,
      resourceType: 'User',
    }
  );

  // Send verification email after the response boundary (AC-2)
  after(async () => {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!appUrl) { console.error('[requestEmailChange] APP_URL_NOT_CONFIGURED'); return; }
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: newEmail,
      subject: 'Verify your new email address',
      html: `<p>Click <a href="${verifyUrl}">here</a> to verify your new email. This link expires in 24 hours.</p>`,
    });
    if (error) console.error('[requestEmailChange] email send failed:', error.message);
  });
}
