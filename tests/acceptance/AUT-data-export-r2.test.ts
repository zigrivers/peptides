/**
 * Task 6.2 R2 upgrade — verifies the large-export branch:
 *   - exports > INLINE_EXPORT_MAX_BYTES upload to R2
 *   - 7-day signed URL is persisted on the DataExportRequest row
 *   - the delivery email contains the link, not an attachment
 *   - audit metadata reflects `delivery: 'r2-link'`
 *   - when R2 is unconfigured, the service falls back to throwing
 *     `export_too_large` (matches v1 behaviour)
 *   - small exports still take the inline path
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserFindUnique = vi.fn();
const mockDataExportCreate = vi.fn();
const mockDataExportUpdateMany = vi.fn();
const mockResendSend = vi.fn();
const mockAuditCreate = vi.fn();
const mockGenerateExport = vi.fn();
const mockIsR2Configured = vi.fn();
const mockStoreInR2 = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        dataExportRequest: {
          create: mockDataExportCreate,
          updateMany: mockDataExportUpdateMany,
        },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockResendSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

vi.mock('@/lib/shared/userDataExport', () => ({
  generateUserDataExport: mockGenerateExport,
  INLINE_EXPORT_MAX_BYTES: 17 * 1024 * 1024,
}));

vi.mock('@/lib/auth/infrastructure/exportStorage', () => ({
  isR2Configured: mockIsR2Configured,
  storeExportInR2: mockStoreInR2,
  R2NotConfiguredError: class R2NotConfiguredError extends Error {
    constructor() {
      super('r2_not_configured');
    }
  },
}));

const USER_ID = 'user-1';
const USER_EMAIL = 'u@example.com';
const INLINE_MAX = 17 * 1024 * 1024;

function bigJson(bytes: number): string {
  // Cheap way to fabricate a payload larger than the inline cap without
  // actually allocating it as JSON: a single oversized string field is
  // sufficient because requestDataExport only checks Buffer.byteLength.
  return JSON.stringify({ pad: 'x'.repeat(bytes - 12) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUserFindUnique.mockResolvedValue({ id: USER_ID, email: USER_EMAIL, name: 'Alice' });
  mockDataExportCreate.mockResolvedValue({ id: 'der-1' });
  mockDataExportUpdateMany.mockResolvedValue({ count: 1 });
  mockResendSend.mockResolvedValue({ error: null });
  mockIsR2Configured.mockReturnValue(true);
  mockStoreInR2.mockResolvedValue({
    key: `exports/${USER_ID}/der-1.json`,
    downloadUrl: 'https://signed.example/abc',
    expiresAt: new Date('2026-05-30T00:00:00Z'),
  });
});

const { requestDataExport } = await import('@/lib/auth/application/requestDataExport');

describe('requestDataExport — R2 branch', () => {
  it('uses R2 + signed URL when the export exceeds INLINE_EXPORT_MAX_BYTES', async () => {
    mockGenerateExport.mockResolvedValueOnce(bigJson(INLINE_MAX + 1024));
    await requestDataExport(USER_ID);

    expect(mockStoreInR2).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, requestId: 'der-1' })
    );
    const sendCall = mockResendSend.mock.calls[0]?.[0];
    expect(sendCall.attachments).toBeUndefined();
    expect(sendCall.html).toContain('https://signed.example/abc');
    expect(sendCall.subject).toContain('ready');

    // DataExportRequest row updated with the signed URL + expiresAt.
    expect(mockDataExportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          downloadUrl: 'https://signed.example/abc',
          expiresAt: new Date('2026-05-30T00:00:00Z'),
        }),
      })
    );

    // Audit metadata reflects R2 delivery.
    const deliveredAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'DATA_EXPORT_DELIVERED'
    );
    expect(deliveredAudits).toHaveLength(1);
    expect(deliveredAudits[0][0].data.metadata).toMatchObject({
      delivery: 'r2-link',
      objectKey: `exports/${USER_ID}/der-1.json`,
    });
  });

  it('still uses inline attachment when the export is under the cap', async () => {
    mockGenerateExport.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    await requestDataExport(USER_ID);

    expect(mockStoreInR2).not.toHaveBeenCalled();
    const sendCall = mockResendSend.mock.calls[0]?.[0];
    expect(sendCall.attachments).toBeDefined();
    expect(sendCall.attachments).toHaveLength(1);

    const deliveredAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'DATA_EXPORT_DELIVERED'
    );
    expect(deliveredAudits[0][0].data.metadata.delivery).toBe('email-inline');
  });

  it('falls back to throwing export_too_large when R2 is not configured', async () => {
    mockGenerateExport.mockResolvedValueOnce(bigJson(INLINE_MAX + 1024));
    mockIsR2Configured.mockReturnValueOnce(false);
    await expect(requestDataExport(USER_ID)).rejects.toThrow('export_too_large');
    expect(mockStoreInR2).not.toHaveBeenCalled();
    expect(mockDataExportCreate).not.toHaveBeenCalled();
  });

  it('writes DATA_EXPORT_FAILED audit when R2 upload throws and surfaces export_storage_failed', async () => {
    mockGenerateExport.mockResolvedValueOnce(bigJson(INLINE_MAX + 1024));
    mockStoreInR2.mockRejectedValueOnce(new Error('s3_403'));
    await expect(requestDataExport(USER_ID)).rejects.toThrow('export_storage_failed');
    const failedAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'DATA_EXPORT_FAILED'
    );
    expect(failedAudits).toHaveLength(1);
    expect(failedAudits[0][0].data.metadata.reason).toBe('r2_upload_failed');
  });

  it('writes DATA_EXPORT_FAILED + throws export_email_failed when Resend fails on the R2 path', async () => {
    mockGenerateExport.mockResolvedValueOnce(bigJson(INLINE_MAX + 1024));
    mockResendSend.mockResolvedValueOnce({ error: { message: 'smtp_down' } });
    await expect(requestDataExport(USER_ID)).rejects.toThrow('export_email_failed');
    // Object was uploaded but the row stays FAILED.
    expect(mockStoreInR2).toHaveBeenCalled();
    const failedAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'DATA_EXPORT_FAILED'
    );
    expect(failedAudits).toHaveLength(1);
    expect(failedAudits[0][0].data.metadata.reason).toBe('email_send_failed');
  });
});
