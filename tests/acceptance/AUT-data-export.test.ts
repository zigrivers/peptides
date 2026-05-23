/**
 * Story: US-AUT-02 (export side) — Self-Serve Data Export
 * Task 6.2 — Phase 2 Legal Gate item 3 remediation
 *
 * A signed-in user (Power or Managed) can request a full export of their
 * own data. The service generates the same exhaustive JSON used by the
 * admin deletion flow, emails it as an attachment to the user, persists a
 * DataExportRequest row, and writes DATA_EXPORT_REQUESTED + DATA_EXPORT_DELIVERED
 * audit events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserFindUnique = vi.fn();
const mockSend = vi.fn();
const mockWithAudit = vi.fn();
const mockDERCreate = vi.fn();
const mockDERUpdate = vi.fn();
const mockGenerateExport = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    dataExportRequest: { create: mockDERCreate, update: mockDERUpdate },
  },
}));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/shared/userDataExport', () => ({
  generateUserDataExport: mockGenerateExport,
  INLINE_EXPORT_MAX_BYTES: 17 * 1024 * 1024,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({ dataExportRequest: { create: mockDERCreate, update: mockDERUpdate } })
  );
  mockUserFindUnique.mockResolvedValue({ id: 'u-1', email: 'user@e.com', name: 'Test User' });
  mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
  mockGenerateExport.mockResolvedValue(JSON.stringify({ userId: 'u-1', protocols: [] }));
  mockDERCreate.mockResolvedValue({ id: 'der-1' });
  mockDERUpdate.mockResolvedValue({});
});

const { requestDataExport } = await import('@/lib/auth/application/requestDataExport');

describe('US-AUT-02: requestDataExport (self-serve)', () => {
  it('AC-1: throws user_not_found when the user does not exist', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    await expect(requestDataExport('u-missing')).rejects.toThrow('user_not_found');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('AC-2: emails the export as a JSON attachment to the requesting user', async () => {
    await requestDataExport('u-1');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@e.com',
        subject: expect.stringContaining('Your data export'),
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringMatching(/^peptides-export-/),
          }),
        ]),
      })
    );
  });

  it('AC-3: persists a DataExportRequest row with status=COMPLETED on success', async () => {
    await requestDataExport('u-1');

    expect(mockDERCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          format: 'JSON',
          status: 'COMPLETED',
        }),
      })
    );
  });

  it('AC-4: writes DATA_EXPORT_DELIVERED audit event with the user as actor + subject', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ dataExportRequest: { create: mockDERCreate, update: mockDERUpdate } });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });

    await requestDataExport('u-1');

    expect(capturedAudit).toMatchObject({
      action: 'DATA_EXPORT_DELIVERED',
      actorUserId: 'u-1',
      subjectUserId: 'u-1',
      resourceType: 'DataExportRequest',
    });
  });

  it('AC-5: throws export_too_large when the JSON exceeds the 17MB inline limit', async () => {
    // 18MB string — over the inline threshold
    mockGenerateExport.mockResolvedValueOnce('x'.repeat(18 * 1024 * 1024));

    await expect(requestDataExport('u-1')).rejects.toThrow('export_too_large');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('AC-6: throws export_email_failed when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ error: { message: 'resend-down' } });

    await expect(requestDataExport('u-1')).rejects.toThrow('export_email_failed');
    // The DataExportRequest row should NOT be created with COMPLETED status if email failed
    expect(mockDERCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
  });

  it('AC-7: identity-scoped — only queries by the userId passed in (no cross-user data leak)', async () => {
    await requestDataExport('u-1');

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { id: true, email: true, name: true },
    });
    expect(mockGenerateExport).toHaveBeenCalledWith('u-1', 'user@e.com');
  });
});
