import { unstable_after as after } from 'next/server';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';
import { EmailChangeRepo } from '@/lib/auth/infrastructure/EmailChangeRepo';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface VerifyEmailChangeInput {
  rawToken: string;
}

/**
 * US-AUT-07 AC-2: Applies the email change atomically and sends an old-address
 * notification with a 48h revert link (AC-4).
 */
export async function verifyEmailChange(input: VerifyEmailChangeInput): Promise<void> {
  const { rawToken } = input;

  const record = await EmailChangeRepo.findByRawToken(rawToken);
  if (!record) throw new Error('token_not_found');

  EmailChangeToken.validateForVerify(record);

  await withAudit(
    async (tx) => {
      const ok = await EmailChangeRepo.applyById(tx, record.id, record.userId, record.newEmail);
      if (!ok) throw new Error('token_already_used');
    },
    {
      actorUserId: record.userId,
      category: 'Auth' as const,
      action: 'EMAIL_CHANGE_APPLIED' as const,
      resourceId: record.userId,
      resourceType: 'User',
    }
  );

  // Send old-email notification with revert link after the response boundary (AC-4)
  after(async () => {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!appUrl) { console.error('[verifyEmailChange] APP_URL_NOT_CONFIGURED'); return; }
    const revertUrl = `${appUrl}/revert-email?token=${rawToken}`;
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: record.oldEmail,
      subject: 'Your email address was changed',
      html: `<p>Your email on Project Peptides was changed to <strong>${record.newEmail}</strong>. If this wasn't you, <a href="${revertUrl}">revert within 48 hours</a>.</p>`,
    });
    if (error) console.error('[verifyEmailChange] email send failed:', error.message);
  });
}
