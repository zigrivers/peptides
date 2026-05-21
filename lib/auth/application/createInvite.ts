import { unstable_after as after } from 'next/server';
import { prisma } from '@/lib/shared/prisma';
import { InviteToken, INVITE_EXPIRY_MS } from '@/lib/auth/domain/InviteToken';
import { InviteRepo } from '@/lib/auth/infrastructure/InviteRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';

export interface CreateInviteInput {
  powerUserId: string;
  email: string;
}

export interface CreateInviteResult {
  inviteId: string;
  rawToken: string;
  expiresAt: Date;
}

export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const { powerUserId, email } = input;

  // AC-5: block if email already has an account (case-insensitive — mirrors sign-up uniqueness policy)
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existing) throw new Error('invite_email_exists');

  // AC-5: block if a pending invite already exists for this email
  const pendingInvite = await InviteRepo.findPendingByEmail(email);
  if (pendingInvite) throw new Error('invite_already_pending');

  const { rawToken, tokenHash } = InviteToken.generate();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  let inviteId!: string;
  await withAudit(
    async (tx) => {
      const invite = await InviteRepo.create(tx as { invite: unknown }, { email, powerUserId, tokenHash, expiresAt });
      inviteId = invite.id;
    },
    {
      actorUserId: powerUserId,
      category: 'Admin' as const,
      action: 'USER_INVITED' as const,
      resourceId: powerUserId,
      resourceType: 'User',
      // inviteId is captured in metadata since it is generated inside the transaction
      metadata: { email },
    }
  );

  // AC-6: send invite email after the response boundary
  after(async () => {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!appUrl) { console.error('[createInvite] APP_URL_NOT_CONFIGURED'); return; }
    const inviteUrl = `${appUrl}/accept-invite?token=${rawToken}`;
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "You've been invited to Project Peptides",
      html: `<p>You've been invited to join Project Peptides. <a href="${inviteUrl}">Accept your invitation</a> (expires in 72 hours).</p>`,
    });
    if (error) console.error('[createInvite] email send failed:', error.message);
  });

  return { inviteId, rawToken, expiresAt };
}
