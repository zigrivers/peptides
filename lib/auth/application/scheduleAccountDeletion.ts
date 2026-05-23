import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import {
  generateUserDataExport,
  INLINE_EXPORT_MAX_BYTES,
} from '@/lib/shared/userDataExport';
import { deactivateSession as deactivateTelegramSession } from '@/lib/ordering/infrastructure/TelegramSessionRepo';

const DELETION_WINDOW_MS = 48 * 60 * 60 * 1000;

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendExportEmail(user: { id: string; email: string; name: string | null }): Promise<void> {
  // Re-uses Task 6.2's pattern: synchronous email-then-mutate so a failed
  // delivery leaves no trail of half-destroyed account state.
  const exportJson = await generateUserDataExport(user.id, user.email);
  const exportBuffer = Buffer.from(exportJson);
  if (exportBuffer.byteLength > INLINE_EXPORT_MAX_BYTES) {
    throw new Error('export_too_large');
  }
  const greeting = user.name ? `Hi ${escapeHtml(user.name)},` : 'Hi,';
  const { error: emailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: 'Your data export — Peptides (account deletion)',
    html: `<p>${greeting}</p><p>You requested to delete your account. Attached is a full JSON export of your data so you keep a copy.</p><p>If you scheduled a delayed deletion, you can cancel it at any time within 48 hours by signing back into the app and clicking <strong>Cancel deletion</strong>.</p>`,
    attachments: [
      {
        filename: `peptides-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`,
        content: exportBuffer.toString('base64'),
      },
    ],
  });
  if (emailError) {
    throw new Error('export_email_failed');
  }
}

export interface ScheduleSelfDeletionInput {
  userId: string;
  /** Must match the user's email (case-insensitive trim) — typed-confirmation gate. */
  confirmEmail: string;
}

export interface ImmediateSelfDeletionInput extends ScheduleSelfDeletionInput {
  /** Second-step explicit acknowledgment for the irreversible immediate path. */
  acknowledged: boolean;
}

/**
 * Schedule a delayed self-deletion (48h window during which the user can
 * cancel by signing back in). Side-effect order is intentional:
 *  1. Validate typed-email confirmation BEFORE any writes.
 *  2. Generate + email the user's data export BEFORE any destructive
 *     change — if delivery fails, abort.
 *  3. Revoke Telegram session (no longer authorised once deletion is
 *     pending; also keeps the export from including a stale session).
 *  4. Inside withAudit: create ADR + set User.status=DELETION_PENDING.
 *
 * Throws: user_not_found, email_mismatch, export_too_large,
 * export_email_failed, deletion_already_pending.
 */
export async function requestSelfDeletion(
  input: ScheduleSelfDeletionInput
): Promise<{ scheduledFor: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true, status: true, managedBy: true },
  });
  if (!user) throw new Error('user_not_found');
  // Managed users cannot self-delete. Their account is governed by the
  // Power User; routing here would create a self-delete ADR with
  // requestedByUserId=null AND user.managedBy!=null, which the cron
  // rejects as malformed (and would restore the user to DEACTIVATED
  // mid-flow). Refuse up-front so the UI can show a meaningful message.
  if (user.managedBy !== null) throw new Error('managed_user_cannot_self_delete');
  if (normaliseEmail(input.confirmEmail) !== normaliseEmail(user.email)) {
    throw new Error('email_mismatch');
  }
  const existing = await prisma.accountDeletionRequest.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true },
  });
  if (existing && existing.status === 'PENDING') {
    throw new Error('deletion_already_pending');
  }

  await sendExportEmail(user);

  const scheduledFor = new Date(Date.now() + DELETION_WINDOW_MS);
  await withAudit(
    async (tx) => {
      // Telegram session revocation lives inside the audited transaction so
      // that if the schedule mutation fails the session is preserved (Task
      // 4.3 lesson: never leave the account in a partial state).
      await deactivateTelegramSession(user.id, tx);
      // upsert lets us reuse this path if a stale non-PENDING row exists
      // (e.g. a prior cancelled deletion already cleaned the row out, but
      // we want to be tolerant of races at the unique userId index).
      await tx.accountDeletionRequest.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          requestedByUserId: null,
          scheduledFor,
          status: 'PENDING',
        },
        update: {
          requestedByUserId: null,
          scheduledFor,
          status: 'PENDING',
        },
      });
      const { count } = await tx.user.updateMany({
        where: { id: user.id, status: { not: 'DELETION_PENDING' } },
        data: { status: 'DELETION_PENDING' },
      });
      if (count === 0) throw new Error('user_status_transition_failed');
      return { id: user.id };
    },
    {
      actorUserId: user.id,
      subjectUserId: user.id,
      category: 'Auth',
      action: 'ACCOUNT_DELETION_SCHEDULED',
      resourceId: user.id,
      resourceType: 'User',
      metadata: { mode: 'delayed_self', scheduledFor: scheduledFor.toISOString() },
    }
  );

  return { scheduledFor };
}

/**
 * Cancel a pending self-deletion during the 48h window. Restores the user
 * to ACTIVE and removes the ADR atomically.
 */
export async function cancelSelfDeletion(userId: string): Promise<void> {
  // Capture `now` once so the predicate and any subsequent reasoning use
  // the same instant. The cron processes ADRs whose scheduledFor <= now,
  // so a cancel that races with the cron will fail the `gt: now`
  // predicate and surface as `no_pending_deletion` to the user — the
  // canonical "you missed the window" signal.
  const now = new Date();
  await withAudit(
    async (tx) => {
      // Scope the cancel to the self-delete shape: the ADR has no
      // requestedByUserId and the user has no managedBy. This both
      // matches the requestSelfDeletion gate and defensively prevents
      // a managed user from being restored to ACTIVE via this path
      // (the admin path manages their state separately).
      const { count: adrCount } = await tx.accountDeletionRequest.deleteMany({
        where: {
          userId,
          status: 'PENDING',
          scheduledFor: { gt: now },
          requestedByUserId: null,
        },
      });
      if (adrCount === 0) throw new Error('no_pending_deletion');
      const { count: userCount } = await tx.user.updateMany({
        where: { id: userId, status: 'DELETION_PENDING', managedBy: null },
        data: { status: 'ACTIVE' },
      });
      if (userCount === 0) throw new Error('user_status_transition_failed');
      return { id: userId };
    },
    {
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Auth',
      action: 'ACCOUNT_DELETION_CANCELLED',
      resourceId: userId,
      resourceType: 'User',
      metadata: { mode: 'self_initiated' },
    }
  );
}

/**
 * Immediate self-deletion. Same destructive sequence as the cron, but
 * gated by typed-email AND explicit second-step acknowledgement. Sends
 * the data-export email first (same export-before-destruction rule).
 */
export async function requestImmediateDeletion(
  input: ImmediateSelfDeletionInput
): Promise<void> {
  if (!input.acknowledged) throw new Error('acknowledgment_required');
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true, managedBy: true },
  });
  if (!user) throw new Error('user_not_found');
  if (user.managedBy !== null) throw new Error('managed_user_cannot_self_delete');
  if (normaliseEmail(input.confirmEmail) !== normaliseEmail(user.email)) {
    throw new Error('email_mismatch');
  }

  await sendExportEmail(user);

  await withAudit(
    async (tx) => {
      // Telegram session deactivation lives inside the transaction so a
      // tx failure doesn't leave the session removed but the user intact.
      await deactivateTelegramSession(user.id, tx);
      // Pre-delete user's own vendor orders so the User→Vendor cascade
      // doesn't trip Order.vendorId FK restrict (same pattern as the
      // managed-user deletion path in AdminService).
      const userVendors = await tx.vendor.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      if (userVendors.length > 0) {
        await tx.order.deleteMany({
          where: { vendorId: { in: userVendors.map((v) => v.id) }, userId: user.id },
        });
      }
      // Clean up any pending ADR (e.g. user scheduled then chose immediate).
      await tx.accountDeletionRequest.deleteMany({ where: { userId: user.id } });
      const { count } = await tx.user.deleteMany({
        where: { id: user.id, managedBy: null },
      });
      if (count === 0) throw new Error('user_not_in_eligible_state');
      return { id: user.id };
    },
    {
      actorUserId: user.id,
      subjectUserId: user.id,
      category: 'Auth',
      action: 'ACCOUNT_DELETED',
      resourceId: user.id,
      resourceType: 'User',
      metadata: { mode: 'immediate_self' },
    }
  );
}
