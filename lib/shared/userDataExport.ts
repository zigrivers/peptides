import { prisma } from '@/lib/shared/prisma';

/**
 * Generates an exhaustive JSON export of every user-owned table that cascades
 * on user deletion (per prisma/schema.prisma `onDelete: Cascade` relations).
 *
 * Used by both:
 *   1. The admin-triggered managed-user deletion flow (Task 4.3) — emailed to
 *      the Power User before any deletion side-effect.
 *   2. The user-self-serve data-export flow (Task 6.2) — emailed to the user
 *      themselves on request, satisfying Phase 2 Legal Gate item 3.
 *
 * Secret/credential fields are stripped via explicit `select` allowlists:
 *   - PushSubscription `auth` and `p256dh` (push notification keys)
 *   - Invite `tokenHash` (sent + received)
 *   - TelegramSession `sessionString` (encrypted session blob)
 *   - EmailChangeRequest `tokenHash`
 *   - DataExportRequest `downloadUrl` (may be a signed URL)
 */
export async function generateUserDataExport(userId: string, userEmail: string): Promise<string> {
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
    prisma.protocol.findMany({ where: { userId } }),
    prisma.cycle.findMany({ where: { userId } }),
    prisma.doseLog.findMany({ where: { userId } }),
    prisma.outcomeLog.findMany({
      where: { userId },
      include: { protocolRatings: true },
    }),
    prisma.vial.findMany({ where: { userId } }),
    prisma.vendor.findMany({
      where: { userId },
      include: {
        products: true,
        orders: { where: { userId }, include: { items: true } },
      },
    }),
    prisma.order.findMany({ where: { userId }, include: { items: true } }),
    prisma.reminderPreference.findMany({ where: { userId } }),
    prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, userId: true, endpoint: true, createdAt: true },
    }),
    prisma.telegramSession.findMany({
      where: { userId },
      select: { id: true, userId: true, isActive: true, lastConnectedIp: true, updatedAt: true },
    }),
    prisma.emailChangeRequest.findMany({
      where: { userId },
      select: { id: true, userId: true, oldEmail: true, newEmail: true, status: true, expiresAt: true, createdAt: true, verifiedAt: true, appliedAt: true, revertibleUntil: true },
    }),
    prisma.dataExportRequest.findMany({
      where: { userId },
      select: { id: true, userId: true, format: true, status: true, expiresAt: true, createdAt: true },
    }),
    prisma.invite.findMany({
      where: { powerUserId: userId },
      select: { id: true, email: true, powerUserId: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, acceptedByUserId: true },
    }),
  ]);

  const [originalInvite, auditEvents] = await Promise.all([
    prisma.invite.findFirst({
      where: { acceptedByUserId: userId },
      select: { id: true, email: true, powerUserId: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, acceptedByUserId: true },
    }),
    prisma.auditEvent.findMany({
      where: { OR: [{ subjectUserId: userId }, { actorUserId: userId }] },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  return JSON.stringify(
    {
      userId,
      email: userEmail,
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

/**
 * Hard cap (raw bytes) on inline-email exports. Resend's attachment limit is
 * 25MB; base64 encoding adds ~33%, so the raw payload threshold is ~17MB to
 * stay safely under the limit with email-header headroom. Exports above this
 * size must route through R2 + signed URL (deferred to a future task; v1
 * scale (1-50 users) does not produce exports this large).
 */
export const INLINE_EXPORT_MAX_BYTES = 17 * 1024 * 1024;
