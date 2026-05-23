import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { resend, FROM_ADDRESS } from '@/lib/shared/email';
import { generateUserDataExport, INLINE_EXPORT_MAX_BYTES } from '@/lib/shared/userDataExport';
import {
  isR2Configured,
  storeExportInR2,
  deleteExportFromR2,
  R2NotConfiguredError,
} from '@/lib/auth/infrastructure/exportStorage';

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
 * Delivery mode is chosen automatically per export size:
 *   - <= 17 MB raw  → inline email attachment (unchanged from v1).
 *   - >  17 MB raw  → R2 object + 7-day signed download URL emailed
 *     to the user. When R2 isn't configured, falls back to throwing
 *     `export_too_large` so dev / pre-R2 envs behave exactly like v1.
 *
 * Throws: user_not_found, export_too_large, export_email_failed,
 *         export_storage_failed.
 */
export async function requestDataExport(userId: string): Promise<{ exportRequestId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error('user_not_found');

  const exportJson = await generateUserDataExport(user.id, user.email);
  const exportBuffer = Buffer.from(exportJson);
  const useR2 = exportBuffer.byteLength > INLINE_EXPORT_MAX_BYTES;
  if (useR2 && !isR2Configured()) {
    console.error('[requestDataExport] export too large and R2 not configured:', exportBuffer.byteLength, 'bytes for', userId);
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
      metadata: {
        format: 'JSON',
        bytes: exportBuffer.byteLength,
        delivery: useR2 ? 'r2-link' : 'email-inline',
      },
    })
  );

  // Branch 1: small export → email attachment (unchanged from v1).
  // Branch 2: large export → R2 upload + signed-URL email (new in this task).
  let r2Result: { downloadUrl: string; objectKey: string; expiresAt: Date } | null = null;
  if (useR2) {
    try {
      const stored = await storeExportInR2({
        userId: user.id,
        requestId: requestRow.id,
        body: exportBuffer,
      });
      r2Result = {
        downloadUrl: stored.downloadUrl,
        objectKey: stored.key,
        expiresAt: stored.expiresAt,
      };
    } catch (err) {
      if (err instanceof R2NotConfiguredError) {
        // Defensive — `isR2Configured` already gated this above. If the
        // env disappears between the check and the put, surface the same
        // user-facing error as the v1 path.
        throw new Error('export_too_large');
      }
      console.error('[requestDataExport] R2 upload failed', { err: (err as Error).message });
      await failExportRequest(requestRow.id, user.id, {
        reason: 'r2_upload_failed',
        detail: (err as Error).message,
      });
      throw new Error('export_storage_failed');
    }
  }

  // Phase 2: send the email synchronously. Resend's HTML field is not
  // sanitized by the library, so escape any user-controlled fields
  // interpolated into the template (user.name).
  const greeting = user.name ? `Hi ${escapeHtml(user.name)},` : 'Hi,';
  const filename = `peptides-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
  const emailPayload = r2Result
    ? {
        subject: 'Your data export is ready — Peptides',
        html: `<p>${greeting}</p><p>Your data export is ready. Use the link below to download it within the next 7 days.</p><p><a href="${escapeHtml(r2Result.downloadUrl)}">Download my export</a></p><p>This link expires on ${escapeHtml(r2Result.expiresAt.toISOString())}. After that, request a new export from your account settings.</p>`,
      }
    : {
        subject: 'Your data export — Peptides',
        html: `<p>${greeting}</p><p>Attached is a full JSON export of your account data. You requested this from your account settings just now.</p><p>If you didn't request this, you can ignore it — no changes were made to your account.</p>`,
      };
  const { error: emailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: emailPayload.subject,
    html: emailPayload.html,
    attachments: r2Result
      ? undefined
      : [{ filename, content: exportBuffer.toString('base64') }],
  });
  if (emailError) {
    console.error('[requestDataExport] email send failed:', emailError.message);
    // If we used R2, the object exists but the user cannot reach it (the
    // signed URL was only in the failed email). Delete it best-effort
    // so we don't strand orphaned exports — the daily cleanup cron is
    // the catch-all, but proactive cleanup here keeps the
    // export-not-delivered window short.
    if (r2Result) {
      await deleteExportFromR2(r2Result.objectKey).catch((cleanupErr) => {
        console.error('[requestDataExport] best-effort r2 cleanup after email-fail failed', {
          objectKey: r2Result?.objectKey,
          err: (cleanupErr as Error).message,
        });
      });
    }
    await failExportRequest(requestRow.id, user.id, {
      reason: 'email_send_failed',
      detail: emailError.message,
    });
    throw new Error('export_email_failed');
  }

  // Phase 3a: mark completed + DELIVERED audit. userId-scoped updateMany +
  // count check for defense-in-depth (matches the pattern in AdminService).
  await withAudit(
    async (tx) => {
      const { count } = await tx.dataExportRequest.updateMany({
        where: { id: requestRow.id, userId: user.id },
        data: {
          status: 'COMPLETED',
          downloadUrl: r2Result?.downloadUrl ?? null,
          expiresAt: r2Result?.expiresAt ?? null,
        },
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
      metadata: {
        format: 'JSON',
        delivery: r2Result ? 'r2-link' : 'email-inline',
        bytes: exportBuffer.byteLength,
        objectKey: r2Result?.objectKey ?? null,
      },
    })
  );

  return { exportRequestId: requestRow.id };
}

async function failExportRequest(
  requestId: string,
  userId: string,
  metadata: { reason: string; detail: string }
): Promise<void> {
  await withAudit(
    async (tx) => {
      const { count } = await tx.dataExportRequest.updateMany({
        where: { id: requestId, userId },
        data: { status: 'FAILED' },
      });
      if (count === 0) throw new Error('data_export_request_not_found');
      return { id: requestId };
    },
    (row) => ({
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Auth' as const,
      action: 'DATA_EXPORT_FAILED' as const,
      resourceId: row.id,
      resourceType: 'DataExportRequest',
      metadata,
    })
  ).catch((err) => console.error('[requestDataExport] failed-status audit also failed:', err));
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
