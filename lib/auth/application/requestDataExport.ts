import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { generateUserDataExport, INLINE_EXPORT_MAX_BYTES } from '@/lib/shared/userDataExport';

/**
 * Self-serve data export for the signed-in user. Generates the same
 * exhaustive JSON used by the admin deletion flow (Task 4.3) but scoped to
 * the requesting user themselves, emails it as a JSON attachment, persists
 * a DataExportRequest row, and writes audit events.
 *
 * Two-phase audit pattern (so every request leaves a durable record, even
 * if email delivery fails):
 *   Phase 1: create DataExportRequest(status='PENDING') + DATA_EXPORT_REQUESTED
 *            audit, both inside a withAudit transaction.
 *   Phase 2: synchronously send the email.
 *   Phase 3a (success): update row to status='COMPLETED' + DATA_EXPORT_DELIVERED
 *                      audit, both inside a second withAudit transaction.
 *   Phase 3b (failure): update row to status='FAILED' (best-effort, no audit)
 *                      and re-throw so the caller surfaces the error.
 *
 * This satisfies Phase 2 Legal Gate item 3 — "managed user can request
 * their data on demand" — without requiring Power User intervention.
 *
 * For v1 (1-50 users), exports stay well under the 17MB inline limit. If a
 * future user's export exceeds it, layer R2 + signed URL on top of this code
 * path (the DataExportRequest schema reserves downloadUrl / expiresAt columns).
 *
 * Throws: user_not_found, export_too_large, export_email_failed.
 */
export async function requestDataExport(userId: string): Promise<{ exportRequestId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error('user_not_found');

  const exportJson = await generateUserDataExport(user.id, user.email);
  const exportBuffer = Buffer.from(exportJson);
  if (exportBuffer.byteLength > INLINE_EXPORT_MAX_BYTES) {
    console.error('[requestDataExport] export too large:', exportBuffer.byteLength, 'bytes for', userId);
    throw new Error('export_too_large');
  }

  // Phase 1: durable request record + REQUESTED audit BEFORE sensitive data
  // leaves the system. If phase-2 email delivery fails, this row is the
  // audit trail saying the user requested it.
  const requestRow = await withAudit(
    async (tx) => {
      return tx.dataExportRequest.create({
        data: {
          userId: user.id,
          format: 'JSON',
          status: 'PENDING',
        },
      });
    },
    (row) => ({
      actorUserId: user.id,
      subjectUserId: user.id,
      category: 'Auth' as const,
      action: 'DATA_EXPORT_REQUESTED' as const,
      resourceId: row.id,
      resourceType: 'DataExportRequest',
      metadata: { format: 'JSON', bytes: exportBuffer.byteLength },
    })
  );

  // Phase 2: send the email synchronously. Resend's HTML field is not
  // sanitized by the library, so escape any user-controlled fields
  // interpolated into the template (user.name).
  const greeting = user.name ? `Hi ${escapeHtml(user.name)},` : 'Hi,';
  const { error: emailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: 'Your data export — Peptides',
    html: `<p>${greeting}</p><p>Attached is a full JSON export of your account data. You requested this from your account settings just now.</p><p>If you didn't request this, you can ignore it — no changes were made to your account.</p>`,
    attachments: [
      {
        filename: `peptides-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`,
        content: exportBuffer.toString('base64'),
      },
    ],
  });
  if (emailError) {
    console.error('[requestDataExport] email send failed:', emailError.message);
    // Best-effort: mark the row FAILED so the audit trail reflects the outcome.
    // updateMany with userId predicate satisfies the userId-scoping rule —
    // DataExportRequest.id is a UUID so the practical risk is nil, but the
    // explicit scope is the documented project standard for user-owned writes.
    await prisma.dataExportRequest
      .updateMany({ where: { id: requestRow.id, userId: user.id }, data: { status: 'FAILED' } })
      .catch((err) => console.error('[requestDataExport] failed-status update also failed:', err));
    throw new Error('export_email_failed');
  }

  // Phase 3a: mark completed + DELIVERED audit. userId-scoped updateMany +
  // count check for defense-in-depth (matches the pattern in AdminService).
  await withAudit(
    async (tx) => {
      const { count } = await tx.dataExportRequest.updateMany({
        where: { id: requestRow.id, userId: user.id },
        data: { status: 'COMPLETED' },
      });
      if (count === 0) throw new Error('data_export_request_not_found');
      return { id: requestRow.id };
    },
    (row) => ({
      actorUserId: user.id,
      subjectUserId: user.id,
      category: 'Auth' as const,
      action: 'DATA_EXPORT_DELIVERED' as const,
      resourceId: row.id,
      resourceType: 'DataExportRequest',
      metadata: { format: 'JSON', delivery: 'email-inline', bytes: exportBuffer.byteLength },
    })
  );

  return { exportRequestId: requestRow.id };
}

/**
 * Minimal HTML escape for interpolating user-controlled values into Resend's
 * HTML template. Covers the five characters that affect HTML parsing — &, <,
 * >, ", '. Sufficient for plain-text interpolation into <p> body context.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
