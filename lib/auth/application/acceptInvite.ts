import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { InviteToken } from '../domain/InviteToken';
import { PasswordHash } from '../domain/PasswordHash';

export interface AcceptInviteInput {
  rawToken: string;
  name: string;
  password: string;
}

/**
 * Accept a managed-user invitation. Hashes the raw token, validates the
 * invite (pending + unexpired + not used), creates the managed-user row
 * atomically with the invite-ACCEPTED update, and writes the
 * INVITE_ACCEPTED audit event in a single transaction.
 *
 * This is the Phase 2 Legal Gate item-1 remediation (acknowledgment
 * click-through): the caller — the public /accept-invite page — shows
 * the consent copy before calling this function; submission IS the
 * acknowledgment, and the INVITE_ACCEPTED audit row is the durable
 * record of that consent.
 *
 * Throws: invite_not_found, invite_already_used, invite_revoked,
 * invite_expired, email_already_in_use, password_too_short, name_required.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<{ userId: string; email: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('name_required');
  if (input.password.length < 8) throw new Error('password_too_short');

  const tokenHash = await InviteToken.hash(input.rawToken);
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (!invite) throw new Error('invite_not_found');
  InviteToken.validateForAccept({ status: invite.status, expiresAt: invite.expiresAt });

  // Defense against the case where someone signed up with this email between
  // the invite being issued and now. The Identity Scoping exception for this
  // pre-auth email lookup is documented in AGENTS.md (auth scoping section).
  const existing = await prisma.user.findFirst({
    where: { email: { equals: invite.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new Error('email_already_in_use');

  const passwordHash = await PasswordHash.create(input.password);

  const created = await withAudit(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email.toLowerCase(),
          name,
          role: 'MANAGED_USER',
          managedBy: invite.powerUserId,
          status: 'ACTIVE',
          passwordHash: passwordHash.toString(),
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      return user;
    },
    (user) => ({
      actorUserId: user.id,
      subjectUserId: user.id,
      category: 'Admin' as const,
      action: 'INVITE_ACCEPTED' as const,
      resourceId: invite.id,
      resourceType: 'Invite',
      metadata: { managedBy: invite.powerUserId, email: invite.email },
    })
  );

  return { userId: created.id, email: created.email };
}
