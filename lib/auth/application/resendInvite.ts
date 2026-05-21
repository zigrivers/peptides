import { unstable_after as after } from 'next/server';
import { prisma } from '@/lib/shared/prisma';
import { InviteToken, INVITE_EXPIRY_MS } from '@/lib/auth/domain/InviteToken';
import { InviteRepo } from '@/lib/auth/infrastructure/InviteRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';

export interface ResendInviteInput {
  powerUserId: string;
  inviteId: string;
}

export interface ResendInviteResult {
  inviteId: string;
  rawToken: string;
  expiresAt: Date;
}

export async function resendInvite(input: ResendInviteInput): Promise<ResendInviteResult> {
  const { powerUserId, inviteId } = input;

  const prior = await InviteRepo.findById(inviteId, powerUserId);
  if (!prior) throw new Error('invite_not_found');
  // AC-4: resend is only permitted on PENDING or EXPIRED invites (not ACCEPTED or REVOKED)
  if (prior.status === 'ACCEPTED') throw new Error('invite_already_accepted');
  if (prior.status === 'REVOKED') throw new Error('invite_revoked');

  // Re-check that the email has not been registered since the original invite was issued
  const existing = await prisma.user.findFirst({
    where: { email: { equals: prior.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new Error('invite_email_exists');

  const { rawToken, tokenHash } = InviteToken.generate();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);
  const email = prior.email;
  const oldInviteId = inviteId;

  let newInviteId!: string;
  await withAudit(
    async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txAny = tx as { invite: any };
      // Only revoke if status is still the same non-ACCEPTED status (guards concurrent acceptance race)
      const revoked = await InviteRepo.revokeById(txAny, oldInviteId, powerUserId, prior.status);
      if (revoked.count !== 1) throw new Error('invite_already_accepted');
      const newInvite = await InviteRepo.create(txAny, { email, powerUserId, tokenHash, expiresAt });
      newInviteId = newInvite.id;
    },
    {
      actorUserId: powerUserId,
      category: 'Admin' as const,
      action: 'INVITE_RESENT' as const,
      resourceId: powerUserId,
      resourceType: 'User',
      metadata: { email, oldInviteId },
    }
  );

  after(async () => {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!appUrl) { console.error('[resendInvite] APP_URL_NOT_CONFIGURED'); return; }
    const inviteUrl = `${appUrl}/accept-invite?token=${rawToken}`;
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Your invitation to Project Peptides has been refreshed",
      html: `<p>Your invitation to Project Peptides has been resent. <a href="${inviteUrl}">Accept your invitation</a> (expires in 72 hours).</p>`,
    });
    if (error) console.error('[resendInvite] email send failed:', error.message);
  });

  return { inviteId: newInviteId, rawToken, expiresAt };
}
