import { unstable_after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';

export type InviteStatus = 'ACTIVE' | 'DEACTIVATED' | 'DELETION_PENDING' | 'INVITED' | 'INVITE_EXPIRED';

export interface AdherenceResult {
  logged: number;
  total: number;
  percent: number;
}

export interface ManagedUserRow {
  id: string;
  email: string;
  name: string | null;
  inviteStatus: InviteStatus;
  inviteExpiresAt: Date | null;
  adherence7Day: AdherenceResult;
  adherence30Day: AdherenceResult;
}

export interface PendingInviteRow {
  id: string;
  email: string;
  inviteStatus: InviteStatus;
  inviteExpiresAt: Date;
}

function adherenceFromLogs(logs: { status: string }[]): AdherenceResult {
  const total = logs.length;
  const logged = logs.filter((l) => l.status === 'LOGGED').length;
  return { logged, total, percent: total === 0 ? 0 : (logged / total) * 100 };
}

async function getBulkAdherence(userIds: string[], days: number): Promise<Map<string, AdherenceResult>> {
  if (userIds.length === 0) return new Map();
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const logs = await prisma.doseLog.findMany({
    where: {
      userId: { in: userIds },
      OR: [
        { scheduledDate: { gte: since, lt: tomorrow }, status: { in: ['LOGGED', 'SKIPPED'] } },
        { scheduledDate: { gte: since, lt: todayMidnight }, status: 'PENDING' },
      ],
    },
    select: { userId: true, status: true },
  });

  const byUser = new Map<string, { status: string }[]>();
  for (const log of logs) {
    if (!byUser.has(log.userId)) byUser.set(log.userId, []);
    byUser.get(log.userId)!.push({ status: log.status });
  }

  const result = new Map<string, AdherenceResult>();
  for (const id of userIds) {
    result.set(id, adherenceFromLogs(byUser.get(id) ?? []));
  }
  return result;
}

export async function getManagedUsersWithAdherence(powerUserId: string): Promise<{
  activeUsers: ManagedUserRow[];
  pendingInvites: PendingInviteRow[];
}> {
  const now = new Date();

  const [managedUsers, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { managedBy: powerUserId },
      select: { id: true, email: true, name: true, status: true },
    }),
    prisma.invite.findMany({
      where: { powerUserId, status: 'PENDING', acceptedByUserId: null },
      select: { id: true, email: true, expiresAt: true },
    }),
  ]);

  const userIds = managedUsers.map((u) => u.id);
  const [adherence7Map, adherence30Map] = await Promise.all([
    getBulkAdherence(userIds, 7),
    getBulkAdherence(userIds, 30),
  ]);

  const activeUserRows: ManagedUserRow[] = managedUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    inviteStatus: (
      u.status === 'DEACTIVATED' ? 'DEACTIVATED' :
      u.status === 'DELETION_PENDING' ? 'DELETION_PENDING' :
      'ACTIVE'
    ) as InviteStatus,
    inviteExpiresAt: null,
    adherence7Day: adherence7Map.get(u.id) ?? { logged: 0, total: 0, percent: 0 },
    adherence30Day: adherence30Map.get(u.id) ?? { logged: 0, total: 0, percent: 0 },
  }));

  const pendingInviteRows: PendingInviteRow[] = pendingInvites.map((inv) => ({
    id: inv.id,
    email: inv.email,
    inviteStatus: (inv.expiresAt > now ? 'INVITED' : 'INVITE_EXPIRED') as InviteStatus,
    inviteExpiresAt: inv.expiresAt,
  }));

  return { activeUsers: activeUserRows, pendingInvites: pendingInviteRows };
}

export interface DoseHistoryEntry {
  id: string;
  compoundName: string;
  scheduledDate: Date;
  loggedAt: Date;
  status: string;
  amount: Prisma.JsonValue;
}

export async function getManagedUserDoseHistory(
  powerUserId: string,
  managedUserId: string,
  days: number
): Promise<DoseHistoryEntry[]> {
  const user = await prisma.user.findFirst({
    where: { id: managedUserId, managedBy: powerUserId },
    select: { id: true },
  });
  if (!user) throw new Error('managed_user_not_found');

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const logs = await prisma.doseLog.findMany({
    where: {
      userId: managedUserId,
      scheduledDate: { gte: since, lt: tomorrow },
      status: { in: ['LOGGED', 'SKIPPED'] },
    },
    include: { protocol: { include: { compound: { select: { name: true } } } } },
    orderBy: { scheduledDate: 'desc' },
  });

  return logs.map((l) => ({
    id: l.id,
    compoundName: l.protocol.compound.name,
    scheduledDate: l.scheduledDate,
    loggedAt: l.loggedAt,
    status: l.status,
    amount: l.amount,
  }));
}

export type DeactivateStatus = 'deactivated' | 'needs_confirmation';

export interface DeactivateResult {
  status: DeactivateStatus;
  activeProtocolCount?: number;
}

export async function deactivateManagedUser(
  powerUserId: string,
  managedUserId: string,
  confirmed: boolean
): Promise<DeactivateResult> {
  const user = await prisma.user.findFirst({
    where: { id: managedUserId, managedBy: powerUserId },
    select: { id: true, status: true },
  });
  if (!user) throw new Error('managed_user_not_found');
  if (user.status === 'DEACTIVATED') return { status: 'deactivated' };
  // DELETION_PENDING is a terminal state — must cancel deletion first to restore to DEACTIVATED
  if (user.status === 'DELETION_PENDING') throw new Error('user_pending_deletion');

  if (!confirmed) {
    const activeProtocols = await prisma.protocol.findMany({
      where: { userId: managedUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeProtocols.length > 0) {
      return { status: 'needs_confirmation', activeProtocolCount: activeProtocols.length };
    }
  }

  await withAudit(
    async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: managedUserId, managedBy: powerUserId, status: 'ACTIVE' },
        data: { status: 'DEACTIVATED', passwordVersion: { increment: 1 } },
      });
      if (count === 0) throw new Error('managed_user_not_found');
    },
    () => ({
      actorUserId: powerUserId,
      subjectUserId: managedUserId,
      category: 'Admin' as const,
      action: 'MANAGED_USER_DEACTIVATED' as const,
      resourceId: managedUserId,
      resourceType: 'User',
      newValues: { status: 'DEACTIVATED' },
    })
  );

  return { status: 'deactivated' };
}

export async function triggerManagedUserPasswordReset(
  powerUserId: string,
  managedUserId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: managedUserId, managedBy: powerUserId, status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (!user) throw new Error('managed_user_not_found');

  const rawToken = await withAudit(
    (tx) => PasswordResetRepo.create(tx, managedUserId),
    {
      actorUserId: powerUserId,
      category: 'Admin' as const,
      action: 'MANAGED_USER_PASSWORD_RESET_TRIGGERED' as const,
      resourceId: managedUserId,
      resourceType: 'User',
      subjectUserId: managedUserId,
    }
  );

  const { email } = user;
  unstable_after(async () => {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!appUrl) {
      console.error('[triggerManagedUserPasswordReset] APP_URL_NOT_CONFIGURED');
      return;
    }
    // /reset-password route convention is shared with requestPasswordReset (lib/auth)
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: 'Reset your password',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
    });
    if (error) console.error('[triggerManagedUserPasswordReset] email send failed:', error.message);
  });
}

async function generateManagedUserExport(managedUserId: string, managedUserEmail: string): Promise<string> {
  // Exhaustive export of every user-owned table that cascades on user deletion
  // (per prisma/schema.prisma onDelete: Cascade relations). Secret fields excluded.
  const [
    protocols,
    cycles,
    doseLogs,
    outcomeLogs,
    vials,
    vendors,
    orders,
    reminderPreferences,
    pushSubscriptions,
    telegramSessions,
    emailChangeRequests,
    dataExportRequests,
    invitesSent,
  ] = await Promise.all([
    prisma.protocol.findMany({ where: { userId: managedUserId } }),
    prisma.cycle.findMany({ where: { userId: managedUserId } }),
    prisma.doseLog.findMany({ where: { userId: managedUserId } }),
    prisma.outcomeLog.findMany({
      where: { userId: managedUserId },
      include: { protocolRatings: true },
    }),
    prisma.vial.findMany({ where: { userId: managedUserId } }),
    prisma.vendor.findMany({
      where: { userId: managedUserId },
      include: { products: true, orders: { include: { items: true } } },
    }),
    // Top-level Order query as a backstop in case any Order rows have userId set
    // but vendor ownership has diverged — Order is its own cascade target.
    prisma.order.findMany({ where: { userId: managedUserId }, include: { items: true } }),
    prisma.reminderPreference.findMany({ where: { userId: managedUserId } }),
    // PushSubscription `auth` and `p256dh` are cryptographic keys for sending notifications — exclude
    prisma.pushSubscription.findMany({
      where: { userId: managedUserId },
      select: { id: true, userId: true, endpoint: true, createdAt: true },
    }),
    prisma.telegramSession.findMany({
      where: { userId: managedUserId },
      select: { id: true, userId: true, isActive: true, lastConnectedIp: true, updatedAt: true },
    }),
    prisma.emailChangeRequest.findMany({
      where: { userId: managedUserId },
      select: { id: true, userId: true, oldEmail: true, newEmail: true, status: true, expiresAt: true, createdAt: true, verifiedAt: true, appliedAt: true, revertibleUntil: true },
    }),
    // DataExportRequest.downloadUrl may be a signed URL — exclude
    prisma.dataExportRequest.findMany({
      where: { userId: managedUserId },
      select: { id: true, userId: true, format: true, status: true, expiresAt: true, createdAt: true },
    }),
    // Invite.tokenHash is a credential — exclude
    prisma.invite.findMany({
      where: { powerUserId: managedUserId },
      select: { id: true, email: true, powerUserId: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, acceptedByUserId: true },
    }),
  ]);
  // Original Invite that created this user account (acceptedByUserId match) and full audit history.
  const [originalInvite, auditEvents] = await Promise.all([
    prisma.invite.findFirst({
      where: { acceptedByUserId: managedUserId },
      select: { id: true, email: true, powerUserId: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, acceptedByUserId: true },
    }),
    prisma.auditEvent.findMany({
      where: { OR: [{ subjectUserId: managedUserId }, { actorUserId: managedUserId }] },
      orderBy: { timestamp: 'asc' },
    }),
  ]);
  return JSON.stringify(
    {
      userId: managedUserId,
      email: managedUserEmail,
      exportedAt: new Date().toISOString(),
      originalInvite,
      protocols,
      cycles,
      doseLogs,
      outcomeLogs,
      vials,
      vendors,
      orders,
      reminderPreferences,
      pushSubscriptions,
      telegramSessions,
      emailChangeRequests,
      dataExportRequests,
      invitesSent,
      auditEvents,
    },
    null,
    2
  );
}

export interface DeletionRequestResult {
  status: 'scheduled';
  scheduledFor: Date;
}

export async function requestManagedUserDeletion(
  powerUserId: string,
  managedUserId: string,
  confirmEmail: string
): Promise<DeletionRequestResult> {
  const managedUser = await prisma.user.findFirst({
    where: { id: managedUserId, managedBy: powerUserId },
    select: { id: true, email: true, status: true },
  });
  if (!managedUser) throw new Error('managed_user_not_found');

  const powerUser = await prisma.user.findFirst({
    where: { id: powerUserId },
    select: { id: true, email: true },
  });
  if (!powerUser) throw new Error('power_user_not_found');

  // Only DEACTIVATED users can be deleted — active sessions must be revoked first
  if (managedUser.status !== 'DEACTIVATED') throw new Error('user_must_be_deactivated');

  // Typed-email confirmation gate against accidental destructive action
  if (confirmEmail !== managedUser.email) throw new Error('email_confirmation_mismatch');

  // Export-first: generate and synchronously deliver the export before any scheduling.
  // If email delivery fails, we throw before the DB write so no deletion is scheduled.
  // Email language deliberately avoids claiming scheduling has succeeded — that
  // happens in the transaction below; the admin only sees confirmation in the UI.
  const exportJson = await generateManagedUserExport(managedUserId, managedUser.email);
  const exportBuffer = Buffer.from(exportJson);
  // Resend hard limit is ~25MB for attachments; bail early to surface a clear error
  if (exportBuffer.byteLength > 20 * 1024 * 1024) {
    console.error('[requestManagedUserDeletion] export too large:', exportBuffer.byteLength);
    throw new Error('export_too_large');
  }
  const { error: emailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: powerUser.email,
    subject: `Data export for ${managedUser.email} — deletion requested`,
    html: `<p>You have requested deletion of managed user <strong>${managedUser.email}</strong>. Their full data export is attached for your records. The deletion will be confirmed in the admin UI once scheduling completes.</p>`,
    attachments: [{ filename: `export-${managedUserId}.json`, content: exportBuffer.toString('base64') }],
  });
  if (emailError) {
    console.error('[requestManagedUserDeletion] export email failed:', emailError.message);
    throw new Error('export_email_failed');
  }

  const scheduledFor = new Date(Date.now() + 48 * 3_600_000);
  await withAudit(
    async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: managedUserId, managedBy: powerUserId, status: 'DEACTIVATED' },
        data: { status: 'DELETION_PENDING' },
      });
      if (count === 0) throw new Error('managed_user_not_found');
      await tx.accountDeletionRequest.create({
        data: { userId: managedUserId, requestedByUserId: powerUserId, scheduledFor, status: 'PENDING' },
      });
    },
    {
      actorUserId: powerUserId,
      subjectUserId: managedUserId,
      category: 'Admin' as const,
      action: 'MANAGED_USER_DELETION_REQUESTED' as const,
      resourceId: managedUserId,
      resourceType: 'User',
      metadata: { scheduledFor: scheduledFor.toISOString(), mode: 'delayed' },
    }
  );

  return { status: 'scheduled', scheduledFor };
}

export async function cancelManagedUserDeletion(
  powerUserId: string,
  managedUserId: string
): Promise<void> {
  const managedUser = await prisma.user.findFirst({
    where: { id: managedUserId, managedBy: powerUserId },
    select: { id: true },
  });
  if (!managedUser) throw new Error('managed_user_not_found');

  const request = await prisma.accountDeletionRequest.findFirst({
    where: { userId: managedUserId, status: 'PENDING' },
    select: { id: true },
  });
  if (!request) throw new Error('no_pending_deletion');

  await withAudit(
    async (tx) => {
      // Update status first so we throw before any irreversible delete if the user has moved on
      const { count } = await tx.user.updateMany({
        where: { id: managedUserId, managedBy: powerUserId, status: 'DELETION_PENDING' },
        data: { status: 'DEACTIVATED' },
      });
      if (count === 0) throw new Error('managed_user_not_found');
      const { count: adrCount } = await tx.accountDeletionRequest.deleteMany({
        where: { id: request.id, userId: managedUserId, status: 'PENDING' },
      });
      if (adrCount === 0) throw new Error('no_pending_deletion');
    },
    {
      actorUserId: powerUserId,
      subjectUserId: managedUserId,
      category: 'Admin' as const,
      action: 'MANAGED_USER_DELETION_CANCELLED' as const,
      resourceId: managedUserId,
      resourceType: 'User',
    }
  );
}

/**
 * System-level cron operation. Per the documented exception in CLAUDE.md
 * Identity Scoping section, the global AccountDeletionRequest scan here is
 * explicitly approved: ownership was verified at request-creation time, and
 * this function only acts on previously authorized deletion records.
 */
export async function processPendingDeletions(): Promise<{ deleted: number }> {
  const now = new Date();
  const pending = await prisma.accountDeletionRequest.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    select: { id: true, userId: true, requestedByUserId: true },
  });

  let deleted = 0;
  for (const req of pending) {
    try {
      const user = await prisma.user.findFirst({
        where: { id: req.userId },
        select: { id: true, managedBy: true },
      });
      if (!user) {
        // Orphaned ADR with no corresponding user — clean up by specific id
        await prisma.accountDeletionRequest.delete({ where: { id: req.id } }).catch(() => {});
        continue;
      }

      // Managed-user deletion requires a recorded requestor that still matches
      // the user's current managedBy. Null requestedByUserId rows are treated as
      // malformed/stale for this cron (the managed-user path always records the
      // requestor; null is reserved for a future self-deletion path with its own
      // authorization invariant). Delete the stale ADR to avoid infinite retry.
      if (!req.requestedByUserId || user.managedBy !== req.requestedByUserId) {
        console.error('[processPendingDeletions] missing or mismatched requestor — aborting and cleaning up ADR', {
          adrId: req.id, userId: req.userId, recordedRequestor: req.requestedByUserId, currentManagedBy: user.managedBy,
        });
        await prisma.accountDeletionRequest.delete({ where: { id: req.id } }).catch(() => {});
        continue;
      }

      await withAudit(
        async (tx) => {
          // Atomically claim the specific ADR row by id inside the transaction
          // userId is @unique on AccountDeletionRequest so there can be at most one pending row per user
          const { count: adrCount } = await tx.accountDeletionRequest.deleteMany({
            where: { id: req.id, userId: req.userId, status: 'PENDING' },
          });
          if (adrCount === 0) throw new Error('already_cancelled');
          // Pre-delete dependent ordering rows so the User → Vendor cascade
          // doesn't hit Order.vendorId FK restrict. Order.userId Cascade
          // handles the user's own orders; we explicitly clear any orders
          // referencing this user's vendors (in case ownership has diverged).
          const userVendors = await tx.vendor.findMany({
            where: { userId: req.userId },
            select: { id: true },
          });
          if (userVendors.length > 0) {
            await tx.order.deleteMany({
              where: { vendorId: { in: userVendors.map((v) => v.id) } },
            });
          }
          // Scope the user delete with managedBy = recorded requestor so the
          // destructive op carries the original authorization predicate
          const { count: userCount } = await tx.user.deleteMany({
            where: { id: req.userId, status: 'DELETION_PENDING', managedBy: req.requestedByUserId },
          });
          if (userCount === 0) throw new Error('user_not_in_deletion_pending');
        },
        {
          actorUserId: 'SYSTEM',
          subjectUserId: req.userId,
          category: 'Admin' as const,
          action: 'MANAGED_USER_DELETED' as const,
          resourceId: req.userId,
          resourceType: 'User',
          metadata: { mode: 'delayed', originalRequestor: req.requestedByUserId },
        }
      );
      deleted++;
    } catch (err) {
      if (err instanceof Error && err.message === 'already_cancelled') continue;
      if (err instanceof Error && err.message === 'user_not_in_deletion_pending') {
        // The user is no longer in DELETION_PENDING (e.g. raced with a cancel or
        // an earlier cron run). The withAudit transaction rolled back so the ADR
        // still exists — delete it explicitly to avoid an infinite retry loop.
        console.error('[processPendingDeletions] user not in DELETION_PENDING — cleaning up stale ADR', {
          adrId: req.id, userId: req.userId,
        });
        await prisma.accountDeletionRequest.delete({ where: { id: req.id } }).catch(() => {});
        continue;
      }
      console.error('[processPendingDeletions] failed for userId', req.userId, err);
    }
  }

  return { deleted };
}
