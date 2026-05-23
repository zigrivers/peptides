import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { InviteRepo } from '../infrastructure/InviteRepo';
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
 * Identity-scoping exceptions documented in AGENTS.md:
 *   - Token-hash invite lookup via InviteRepo.findByTokenHash (existing
 *     pre-auth exception — the unforgeable SHA-256 hash IS the credential).
 *   - System-wide email uniqueness check via prisma.user.findFirst
 *     (new exception added in this PR — same justification as createInvite's:
 *     pre-auth boundary checking whether the email is already registered).
 *
 * Throws: invite_not_found, invite_already_used, invite_revoked,
 * invite_expired, email_already_in_use, password_too_short, name_required.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<{ userId: string; email: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('name_required');
  if (input.password.length < 8) throw new Error('password_too_short');

  const tokenHash = await InviteToken.hash(input.rawToken);
  const invite = await InviteRepo.findByTokenHash(tokenHash);
  if (!invite) throw new Error('invite_not_found');
  InviteToken.validateForAccept({ status: invite.status, expiresAt: invite.expiresAt });

  // Pre-auth system-wide email uniqueness check. Documented exception in
  // AGENTS.md (same pattern as lib/auth/application/createInvite.ts). Selects
  // only `id`; never returns user-authored content.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: invite.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new Error('email_already_in_use');

  const passwordHash = await PasswordHash.create(input.password);

  const created = await withAudit(
    async (tx) => {
      // Create the user first because invite.acceptedByUserId references it.
      // The pre-transaction findFirst is best-effort — a concurrent registration
      // or a race with another acceptInvite call may still trip the unique-email
      // constraint at insert time. Translate P2002 to the same user-facing error
      // so the UX is consistent regardless of which check caught the conflict.
      let user;
      try {
        user = await tx.user.create({
          data: {
            email: invite.email.toLowerCase(),
            name,
            role: 'MANAGED_USER',
            managedBy: invite.powerUserId,
            status: 'ACTIVE',
            passwordHash: passwordHash.toString(),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new Error('email_already_in_use');
        }
        throw err;
      }
      // Atomic claim: only succeeds if the invite is still PENDING and not
      // expired. This closes the TOCTOU window between the pre-transaction
      // validation and the update — a concurrent revoke or re-acceptance
      // attempt rolls this entire transaction back (including the user.create).
      const { count } = await tx.invite.updateMany({
        where: { id: invite.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      if (count === 0) throw new Error('invite_no_longer_valid');
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
