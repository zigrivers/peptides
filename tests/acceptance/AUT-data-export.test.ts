/**
 * Story: US-AUT-02 (export side) — Self-Serve Data Export
 * Task 6.2 — Phase 2 Legal Gate item 3 remediation
 *
 * A signed-in user (Power or Managed) can request a full export of their
 * own data. Two-phase audit: PENDING + DATA_EXPORT_REQUESTED audit BEFORE
 * the email leaves the system; on success, status flips to COMPLETED with
 * a DATA_EXPORT_DELIVERED audit; on email failure, status flips to FAILED
 * and the action throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserFindUnique = vi.fn();
const mockSend = vi.fn();
const mockWithAudit = vi.fn();
const mockDERCreate = vi.fn();
const mockDERUpdateMany = vi.fn();
const mockGenerateExport = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    dataExportRequest: { updateMany: mockDERUpdateMany }, // outer-prisma (for FAILED status)
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
  // Default setupWithAudit: tx exposes both create + updateMany on dataExportRequest
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({ dataExportRequest: { create: mockDERCreate, updateMany: mockDERUpdateMany } })
  );
  mockUserFindUnique.mockResolvedValue({ id: 'u-1', email: 'user@e.com', name: 'Test User' });
  mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
  mockGenerateExport.mockResolvedValue(JSON.stringify({ userId: 'u-1', protocols: [] }));
  // Phase 1 create returns a row with id; phase 3a updateMany returns count.
  mockDERCreate.mockResolvedValue({ id: 'der-1', status: 'PENDING' });
  mockDERUpdateMany.mockResolvedValue({ count: 1 });
});

const { requestDataExport } = await import('@/lib/auth/application/requestDataExport');

describe('US-AUT-02: requestDataExport (self-serve)', () => {
  it('AC-1: throws user_not_found when the user does not exist', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    await expect(requestDataExport('u-missing')).rejects.toThrow('user_not_found');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockDERCreate).not.toHaveBeenCalled();
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

  it('AC-3: persists DataExportRequest as PENDING first, then flips to COMPLETED', async () => {
    await requestDataExport('u-1');

    // Phase 1: create with PENDING
    expect(mockDERCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          format: 'JSON',
          status: 'PENDING',
        }),
      })
    );

    // Phase 3a: updateMany to COMPLETED, scoped with userId
    expect(mockDERUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'der-1', userId: 'u-1' },
        data: { status: 'COMPLETED' },
      })
    );
  });

  it('AC-4: writes DATA_EXPORT_REQUESTED before email, DATA_EXPORT_DELIVERED after', async () => {
    const captured: unknown[] = [];
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ dataExportRequest: { create: mockDERCreate, updateMany: mockDERUpdateMany } });
      captured.push(typeof buildAudit === 'function' ? buildAudit(result) : buildAudit);
      return result;
    });

    await requestDataExport('u-1');

    expect(captured[0]).toMatchObject({
      action: 'DATA_EXPORT_REQUESTED',
      actorUserId: 'u-1',
      subjectUserId: 'u-1',
      resourceType: 'DataExportRequest',
    });
    expect(captured[1]).toMatchObject({
      action: 'DATA_EXPORT_DELIVERED',
      actorUserId: 'u-1',
      subjectUserId: 'u-1',
      resourceType: 'DataExportRequest',
    });
  });

  it('AC-5: throws export_too_large when JSON exceeds the 17MB inline limit', async () => {
    mockGenerateExport.mockResolvedValueOnce('x'.repeat(18 * 1024 * 1024));

    await expect(requestDataExport('u-1')).rejects.toThrow('export_too_large');
    expect(mockDERCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('AC-6: throws export_email_failed and marks the row FAILED when Resend errors', async () => {
    mockSend.mockResolvedValueOnce({ error: { message: 'resend-down' } });

    await expect(requestDataExport('u-1')).rejects.toThrow('export_email_failed');

    // Phase 1 PENDING create still happened — that's the durable audit trail
    expect(mockDERCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) })
    );
    // Phase 3a COMPLETED updateMany did NOT happen
    expect(mockDERUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } })
    );
    // Best-effort FAILED status updateMany happened (outer prisma, userId-scoped)
    expect(mockDERUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'der-1', userId: 'u-1' }, data: { status: 'FAILED' } })
    );
  });

  it('AC-6b: writes DATA_EXPORT_FAILED audit on email failure', async () => {
    const captured: unknown[] = [];
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ dataExportRequest: { create: mockDERCreate, updateMany: mockDERUpdateMany } });
      captured.push(typeof buildAudit === 'function' ? buildAudit(result) : buildAudit);
      return result;
    });
    mockSend.mockResolvedValueOnce({ error: { message: 'resend-down' } });

    await expect(requestDataExport('u-1')).rejects.toThrow('export_email_failed');

    // Two audit events: REQUESTED (phase 1) and FAILED (phase 3b)
    expect(captured[0]).toMatchObject({ action: 'DATA_EXPORT_REQUESTED' });
    expect(captured[1]).toMatchObject({
      action: 'DATA_EXPORT_FAILED',
      actorUserId: 'u-1',
      subjectUserId: 'u-1',
      resourceType: 'DataExportRequest',
    });
  });

  it('AC-7: identity-scoped — only queries by the userId passed in', async () => {
    await requestDataExport('u-1');

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { id: true, email: true, name: true },
    });
    expect(mockGenerateExport).toHaveBeenCalledWith('u-1', 'user@e.com');
  });

  it('AC-8: escapes HTML in user.name before interpolating into the email body', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'u-1',
      email: 'user@e.com',
      name: '<script>alert(1)</script>',
    });

    await requestDataExport('u-1');

    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.html).not.toContain('<script>');
    expect(sendArgs.html).toContain('&lt;script&gt;');
  });
});
