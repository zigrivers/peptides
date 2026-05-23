import { prisma } from '@/lib/shared/prisma';

export type InviteStatus = 'ACTIVE' | 'DEACTIVATED' | 'INVITED' | 'INVITE_EXPIRED';

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

async function getAdherence(userId: string, days: number): Promise<AdherenceResult> {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const logs = await prisma.doseLog.findMany({
    where: {
      userId,
      OR: [
        { scheduledDate: { gte: since, lt: tomorrow }, status: { in: ['LOGGED', 'SKIPPED'] } },
        { scheduledDate: { gte: since, lt: todayMidnight }, status: 'PENDING' },
      ],
    },
    select: { status: true },
  });

  return adherenceFromLogs(logs);
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

  const activeUserRows = await Promise.all(
    managedUsers.map(async (u) => {
      const [adherence7Day, adherence30Day] = await Promise.all([
        getAdherence(u.id, 7),
        getAdherence(u.id, 30),
      ]);
      return {
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        inviteStatus: (u.status === 'DEACTIVATED' ? 'DEACTIVATED' : 'ACTIVE') as InviteStatus,
        inviteExpiresAt: null,
        adherence7Day,
        adherence30Day,
      };
    })
  );

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
  amount: unknown;
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
