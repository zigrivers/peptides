import { unstable_after as after } from 'next/server';
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
        where: { id: managedUserId, managedBy: powerUserId, status: { not: 'DEACTIVATED' } },
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
    where: { id: managedUserId, managedBy: powerUserId, status: { not: 'DEACTIVATED' } },
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
  after(async () => {
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
  const [protocols, doseLogs, vials, outcomeLogs] = await Promise.all([
    prisma.protocol.findMany({ where: { userId: managedUserId } }),
    prisma.doseLog.findMany({ where: { userId: managedUserId } }),
    prisma.vial.findMany({ where: { userId: managedUserId } }),
    prisma.outcomeLog.findMany({ where: { userId: managedUserId } }),
  ]);
  return JSON.stringify(
    { userId: managedUserId, email: managedUserEmail, exportedAt: new Date().toISOString(), protocols, doseLogs, vials, outcomeLogs },
    null,
    2
  );
}

export interface DeletionRequestResult {
  status: 'scheduled' | 'deleted' | 'needs_second_confirm';
  scheduledFor?: Date;
}

export async function requestManagedUserDeletion(
  powerUserId: string,
  managedUserId: string,
  immediate: boolean,
  secondConfirm = false
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
  if (!powerUser) throw new Error('managed_user_not_found');

  if (immediate && !secondConfirm) {
    return { status: 'needs_second_confirm' };
  }

  const exportJson = await generateManagedUserExport(managedUserId, managedUser.email);
  const adminEmail = powerUser.email;
  const managedEmail = managedUser.email;

  after(async () => {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: adminEmail,
      subject: `Data export for ${managedEmail} — before account deletion`,
      html: `<p>The deletion of managed user <strong>${managedEmail}</strong> has been ${immediate ? 'executed immediately' : 'scheduled'}. Their data export is attached.</p>`,
      attachments: [{ filename: `export-${managedUserId}.json`, content: Buffer.from(exportJson).toString('base64') }],
    });
    if (error) console.error('[requestManagedUserDeletion] export email failed:', error.message);
  });

  if (immediate) {
    await withAudit(
      async (tx) => { await tx.user.delete({ where: { id: managedUserId } }); },
      {
        actorUserId: powerUserId,
        subjectUserId: managedUserId,
        category: 'Admin' as const,
        action: 'MANAGED_USER_DELETED' as const,
        resourceId: managedUserId,
        resourceType: 'User',
        metadata: { mode: 'immediate' },
      }
    );
    return { status: 'deleted' };
  }

  const scheduledFor = new Date(Date.now() + 48 * 3_600_000);
  await withAudit(
    async (tx) => {
      await tx.user.updateMany({
        where: { id: managedUserId },
        data: { status: 'DELETION_PENDING' },
      });
      await tx.accountDeletionRequest.create({
        data: { userId: managedUserId, scheduledFor, status: 'PENDING' },
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
      await tx.accountDeletionRequest.delete({ where: { id: request.id } });
      await tx.user.updateMany({ where: { id: managedUserId }, data: { status: 'DEACTIVATED' } });
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

export async function processPendingDeletions(): Promise<{ deleted: number }> {
  const now = new Date();
  const pending = await prisma.accountDeletionRequest.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    select: { userId: true },
  });

  let deleted = 0;
  for (const req of pending) {
    const user = await prisma.user.findFirst({
      where: { id: req.userId },
      select: { id: true, managedBy: true },
    });
    if (!user) continue;

    await withAudit(
      async (tx) => { await tx.user.delete({ where: { id: req.userId } }); },
      {
        actorUserId: user.managedBy ?? req.userId,
        subjectUserId: req.userId,
        category: 'Admin' as const,
        action: 'MANAGED_USER_DELETED' as const,
        resourceId: req.userId,
        resourceType: 'User',
        metadata: { mode: 'delayed' },
      }
    );
    deleted++;
  }

  return { deleted };
}
