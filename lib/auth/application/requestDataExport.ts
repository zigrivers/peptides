import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { generateUserDataExport, INLINE_EXPORT_MAX_BYTES } from '@/lib/shared/userDataExport';

/**
 * Self-serve data export for the signed-in user. Generates the same
 * exhaustive JSON used by the admin deletion flow (Task 4.3) but scoped to
 * the requesting user themselves, emails it as a JSON attachment, persists
 * a DataExportRequest row with status COMPLETED, and writes the
 * DATA_EXPORT_DELIVERED audit event.
 *
 * This satisfies Phase 2 Legal Gate item 3 — "managed user can request
 * their data on demand" — without requiring Power User intervention.
 *
 * For v1 (1–50 users), exports stay well under the 17MB inline limit. If
 * a future user's export exceeds it, we'll layer R2 + signed URL on top
 * of this code path (the DataExportRequest schema already has the
 * downloadUrl / expiresAt columns reserved). See task 6.2 plan.
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

  // Send the export synchronously BEFORE the audit / persistence write so we
  // don't claim "COMPLETED" if delivery failed. If Resend fails, throw —
  // user retries later.
  const { error: emailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: 'Your data export — Peptides',
    html: `<p>Hi ${user.name ?? ''},</p><p>Attached is a full JSON export of your account data. You requested this from your account settings just now.</p><p>If you didn't request this, you can ignore it — no changes were made to your account.</p>`,
    attachments: [
      {
        filename: `peptides-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`,
        content: exportBuffer.toString('base64'),
      },
    ],
  });
  if (emailError) {
    console.error('[requestDataExport] email send failed:', emailError.message);
    throw new Error('export_email_failed');
  }

  const created = await withAudit(
    async (tx) => {
      // Persist DataExportRequest as COMPLETED — email already delivered above.
      const row = await tx.dataExportRequest.create({
        data: {
          userId: user.id,
          format: 'JSON',
          status: 'COMPLETED',
          // expiresAt left null for inline-email exports; future R2 path will populate.
        },
      });
      return row;
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

  return { exportRequestId: created.id };
}
