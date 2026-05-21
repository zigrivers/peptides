import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrismaVendorCreate = vi.fn();
const mockPrismaVendorFindMany = vi.fn();
const mockPrismaVendorFindFirst = vi.fn();
const mockPrismaVendorUpdateMany = vi.fn();
const mockPrismaVendorProductCreate = vi.fn();
const mockPrismaVendorProductFindMany = vi.fn();
const mockPrismaVendorProductFindFirst = vi.fn();
const mockPrismaVendorProductUpdate = vi.fn();
const mockPrismaTelegramSessionUpsert = vi.fn();
const mockPrismaTelegramSessionFindUnique = vi.fn();
const mockPrismaTelegramSessionDelete = vi.fn();
const mockPrismaTelegramSessionDeleteMany = vi.fn();
const mockPrismaAuditEventCreate = vi.fn();

const mockStartPhoneAuth = vi.fn();
const mockCompletePhoneAuth = vi.fn();
const mockCompletePhoneAuthWithPassword = vi.fn();
const mockLogoutSession = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    vendor: {
      create: mockPrismaVendorCreate,
      findMany: mockPrismaVendorFindMany,
      findFirst: mockPrismaVendorFindFirst,
      updateMany: mockPrismaVendorUpdateMany,
    },
    vendorProduct: {
      create: mockPrismaVendorProductCreate,
      findMany: mockPrismaVendorProductFindMany,
      findFirst: mockPrismaVendorProductFindFirst,
      update: mockPrismaVendorProductUpdate,
    },
    telegramSession: {
      upsert: mockPrismaTelegramSessionUpsert,
      findUnique: mockPrismaTelegramSessionFindUnique,
      delete: mockPrismaTelegramSessionDelete,
      deleteMany: mockPrismaTelegramSessionDeleteMany,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        vendor: {
          create: mockPrismaVendorCreate,
          findFirst: mockPrismaVendorFindFirst,
          updateMany: mockPrismaVendorUpdateMany,
        },
        vendorProduct: {
          create: mockPrismaVendorProductCreate,
          findFirst: mockPrismaVendorProductFindFirst,
          update: mockPrismaVendorProductUpdate,
        },
        telegramSession: {
          upsert: mockPrismaTelegramSessionUpsert,
          findUnique: mockPrismaTelegramSessionFindUnique,
          delete: mockPrismaTelegramSessionDelete,
        },
        auditEvent: { create: mockPrismaAuditEventCreate },
        // Expose $transaction on tx so withAudit can detect it as a PrismaClient
        $transaction: undefined,
      };
      return fn(tx);
    }),
  },
}));

vi.mock('@/lib/ordering/infrastructure/MTProtoClient', () => ({
  startPhoneAuth: mockStartPhoneAuth,
  completePhoneAuth: mockCompletePhoneAuth,
  completePhoneAuthWithPassword: mockCompletePhoneAuthWithPassword,
  logoutSession: mockLogoutSession,
}));

/**
 * Story: US-ORD-06 - Manage Vendor Catalog
 */
describe('US-ORD-06: Manage Vendor Catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaAuditEventCreate.mockResolvedValue({});
  });

  describe('VendorService - createVendor', () => {
    it('AC-1: creates a vendor with required fields and ACTIVE status', async () => {
      const { createVendor } = await import('@/lib/ordering/application/VendorService');

      mockPrismaVendorCreate.mockResolvedValueOnce({
        id: 'vendor-1',
        userId: 'user-1',
        name: 'QSC',
        telegramUsername: 'qsc_vendor',
        messageTemplate: null,
        preferredCurrency: 'USDT',
        status: 'ACTIVE',
        createdAt: new Date(),
        products: [],
      });

      const result = await createVendor({
        userId: 'user-1',
        name: 'QSC',
        telegramUsername: 'qsc_vendor',
        preferredCurrency: 'USDT',
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.name).toBe('QSC');
      expect(mockPrismaVendorCreate).toHaveBeenCalledOnce();
    });

    it('AC-1: userId-scopes the created vendor to the actor', async () => {
      const { createVendor } = await import('@/lib/ordering/application/VendorService');

      mockPrismaVendorCreate.mockResolvedValueOnce({
        id: 'vendor-1',
        userId: 'user-1',
        name: 'Test',
        telegramUsername: 'test_v',
        messageTemplate: null,
        preferredCurrency: 'USDT',
        status: 'ACTIVE',
        createdAt: new Date(),
        products: [],
      });

      await createVendor({ userId: 'user-1', name: 'Test', telegramUsername: 'test_v', preferredCurrency: 'USDT' });

      const createCall = mockPrismaVendorCreate.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
    });
  });

  describe('VendorService - listVendorsForUser', () => {
    it('AC-1: returns only the user\'s own vendors', async () => {
      const { listVendorsForUser } = await import('@/lib/ordering/application/VendorService');

      mockPrismaVendorFindMany.mockResolvedValueOnce([
        { id: 'v1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc', messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(), products: [] },
      ]);

      const vendors = await listVendorsForUser('user-1');
      expect(vendors).toHaveLength(1);

      const call = mockPrismaVendorFindMany.mock.calls[0][0];
      expect(call.where.userId).toBe('user-1');
    });
  });

  describe('VendorService - disableVendor', () => {
    it('AC-1: sets status to DISABLED via userId-scoped updateMany', async () => {
      const { disableVendor } = await import('@/lib/ordering/application/VendorService');

      mockPrismaVendorUpdateMany.mockResolvedValueOnce({ count: 1 });

      await disableVendor('user-1', 'vendor-1');

      const updateCall = mockPrismaVendorUpdateMany.mock.calls[0][0];
      expect(updateCall.data.status).toBe('DISABLED');
      expect(updateCall.where.userId).toBe('user-1');
      expect(updateCall.where.id).toBe('vendor-1');
    });

    it('AC-1: throws not_found if vendor does not belong to user', async () => {
      const { disableVendor } = await import('@/lib/ordering/application/VendorService');

      mockPrismaVendorUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(disableVendor('user-1', 'vendor-other')).rejects.toThrow('vendor_not_found');
    });
  });

  describe('VendorProductService - createProduct', () => {
    it('AC-1: creates a product linked to a vendor and compound', async () => {
      const { createVendorProduct } = await import('@/lib/ordering/application/VendorProductService');

      mockPrismaVendorFindFirst.mockResolvedValueOnce({ id: 'vendor-1', userId: 'user-1' });
      mockPrismaVendorProductCreate.mockResolvedValueOnce({
        id: 'prod-1',
        vendorId: 'vendor-1',
        compoundId: 'compound-1',
        name: 'BPC-157 5mg',
        priceUsd: '45.00',
        inStock: true,
      });

      const result = await createVendorProduct({
        userId: 'user-1',
        vendorId: 'vendor-1',
        compoundId: 'compound-1',
        name: 'BPC-157 5mg',
        priceUsd: '45.00',
        inStock: true,
      });

      expect(result.vendorId).toBe('vendor-1');
      expect(mockPrismaVendorProductCreate).toHaveBeenCalledOnce();
    });

    it('AC-1: throws vendor_not_found if vendor does not belong to user or is not ACTIVE', async () => {
      const { createVendorProduct } = await import('@/lib/ordering/application/VendorProductService');

      mockPrismaVendorFindFirst.mockResolvedValueOnce(null);

      await expect(createVendorProduct({
        userId: 'user-1',
        vendorId: 'other-vendor',
        compoundId: 'c-1',
        name: 'Test',
        priceUsd: '10.00',
        inStock: true,
      })).rejects.toThrow('vendor_not_found');
    });
  });

  describe('VendorProductService - archiveProduct', () => {
    it('AC-2: sets inStock=false via scoped findFirst + update in same tx; does not delete (preserves OrderItem links)', async () => {
      const { archiveVendorProduct } = await import('@/lib/ordering/application/VendorProductService');

      mockPrismaVendorProductFindFirst.mockResolvedValueOnce({
        id: 'prod-1', vendorId: 'vendor-1', compoundId: 'c-1',
        name: 'BPC-157 5mg', priceUsd: '45.00', inStock: true,
      });
      mockPrismaVendorProductUpdate.mockResolvedValueOnce({ id: 'prod-1', inStock: false });

      await archiveVendorProduct('user-1', 'prod-1');

      const findCall = mockPrismaVendorProductFindFirst.mock.calls[0][0];
      expect(findCall.where.id).toBe('prod-1');
      expect(findCall.where.vendor.userId).toBe('user-1');
      const updateCall = mockPrismaVendorProductUpdate.mock.calls[0][0];
      expect(updateCall.data.inStock).toBe(false);
      expect(updateCall.where.id).toBe('prod-1');
    });

    it('AC-2: throws not_found if product does not belong to user\'s vendor', async () => {
      const { archiveVendorProduct } = await import('@/lib/ordering/application/VendorProductService');

      mockPrismaVendorProductFindFirst.mockResolvedValueOnce(null);

      await expect(archiveVendorProduct('user-1', 'prod-other')).rejects.toThrow('product_not_found');
    });
  });
});

/**
 * Story: US-ORD-01 - Configure Telegram MTProto
 */
describe('US-ORD-01: Configure Telegram MTProto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaAuditEventCreate.mockResolvedValue({});
    mockLogoutSession.mockResolvedValue(undefined);
    process.env.TELEGRAM_SESSION_KEY = 'a'.repeat(64);
    process.env.TELEGRAM_APP_ID = '12345';
    process.env.TELEGRAM_APP_HASH = 'abc123hash';
  });

  it('AC-1: initiates phone auth, stores tempSession server-side, and returns opaque flowId + phoneCodeHash', async () => {
    const { initiateTelegramLink } = await import('@/lib/ordering/application/TelegramAuthService');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });

    const result = await initiateTelegramLink('user-1', '+15551234567');
    expect(result.phoneCodeHash).toBe('hash-abc');
    expect(typeof result.flowId).toBe('string');
    expect(result.flowId.length).toBeGreaterThan(0);
    // tempSession must NOT be returned to the caller — only the opaque flowId
    expect(result).not.toHaveProperty('tempSession');
    expect(mockStartPhoneAuth).toHaveBeenCalledWith('+15551234567');
  });

  it('AC-1: completes auth, encrypts session, and persists to DB via repo', async () => {
    const { initiateTelegramLink, completeTelegramLink } = await import('@/lib/ordering/application/TelegramAuthService');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });
    mockCompletePhoneAuth.mockResolvedValueOnce({ type: 'success', sessionString: 'raw-session-string' });
    mockPrismaTelegramSessionUpsert.mockResolvedValueOnce({ id: 'ts-1', userId: 'user-1' });

    const { flowId } = await initiateTelegramLink('user-1', '+15551234567');
    await completeTelegramLink('user-1', '+15551234567', 'hash-abc', '12345', flowId);

    expect(mockPrismaTelegramSessionUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockPrismaTelegramSessionUpsert.mock.calls[0][0];
    // session string must be encrypted (not the raw value)
    expect(upsertCall.create.sessionString).not.toBe('raw-session-string');
    expect(upsertCall.update.sessionString).not.toBe('raw-session-string');
    // userId must be present for ownership scoping
    expect(upsertCall.where.userId).toBe('user-1');
  });

  it('AC-2: session string persisted to DB is AES-256-GCM encrypted (decryptable)', async () => {
    const { initiateTelegramLink, completeTelegramLink } = await import('@/lib/ordering/application/TelegramAuthService');
    const { decryptSession } = await import('@/lib/ordering/application/SessionManager');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });
    mockCompletePhoneAuth.mockResolvedValueOnce({ type: 'success', sessionString: 'plaintext-session' });
    mockPrismaTelegramSessionUpsert.mockResolvedValueOnce({ id: 'ts-1', userId: 'user-1' });

    const { flowId } = await initiateTelegramLink('user-1', '+15551234567');
    await completeTelegramLink('user-1', '+15551234567', 'hash-abc', '99999', flowId);

    const upsertCall = mockPrismaTelegramSessionUpsert.mock.calls[0][0];
    const stored = upsertCall.create.sessionString as string;
    expect(decryptSession(stored)).toBe('plaintext-session');
  });

  it('AC-2: audit event TELEGRAM_SESSION_LINKED is written on successful link', async () => {
    const { initiateTelegramLink, completeTelegramLink } = await import('@/lib/ordering/application/TelegramAuthService');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });
    mockCompletePhoneAuth.mockResolvedValueOnce({ type: 'success', sessionString: 'session' });
    mockPrismaTelegramSessionUpsert.mockResolvedValueOnce({ id: 'ts-1', userId: 'user-1' });

    const { flowId } = await initiateTelegramLink('user-1', '+15551234567');
    await completeTelegramLink('user-1', '+15551234567', 'hash-abc', '11111', flowId);

    expect(mockPrismaAuditEventCreate).toHaveBeenCalledOnce();
    const auditCall = mockPrismaAuditEventCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe('TELEGRAM_SESSION_LINKED');
    expect(auditCall.data.actorUserId).toBe('user-1');
  });

  it('AC-3: returns passwordRequired=true and same flowId when Telegram requires 2FA; no DB write yet', async () => {
    const { initiateTelegramLink, completeTelegramLink } = await import('@/lib/ordering/application/TelegramAuthService');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });
    mockCompletePhoneAuth.mockResolvedValueOnce({ type: 'password_required', tempSession: 'session-with-authkey' });

    const { flowId } = await initiateTelegramLink('user-1', '+15551234567');
    const result = await completeTelegramLink('user-1', '+15551234567', 'hash-abc', '12345', flowId);

    expect(result.passwordRequired).toBe(true);
    if (result.passwordRequired) {
      // Same flowId is returned so UI can use it for the password step without receiving tempSession.
      expect(result.flowId).toBe(flowId);
    }
    // No DB write should happen until the password is also verified.
    expect(mockPrismaTelegramSessionUpsert).not.toHaveBeenCalled();
  });

  it('AC-3: completeTelegramLinkWithPassword validates flowId server-side, encrypts session, and writes audit event', async () => {
    const { initiateTelegramLink, completeTelegramLink, completeTelegramLinkWithPassword } =
      await import('@/lib/ordering/application/TelegramAuthService');
    const { decryptSession } = await import('@/lib/ordering/application/SessionManager');

    mockStartPhoneAuth.mockResolvedValueOnce({ phoneCodeHash: 'hash-abc', tempSession: 'tmp-sess' });
    mockCompletePhoneAuth.mockResolvedValueOnce({ type: 'password_required', tempSession: 'session-with-authkey' });
    mockCompletePhoneAuthWithPassword.mockResolvedValueOnce({ sessionString: '2fa-session' });
    mockPrismaTelegramSessionUpsert.mockResolvedValueOnce({ id: 'ts-1', userId: 'user-1' });

    const { flowId } = await initiateTelegramLink('user-1', '+15551234567');
    const codeResult = await completeTelegramLink('user-1', '+15551234567', 'hash-abc', '12345', flowId);
    const continueFlowId = codeResult.passwordRequired ? codeResult.flowId : '';

    await completeTelegramLinkWithPassword('user-1', 'my-password', continueFlowId);

    expect(mockPrismaTelegramSessionUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockPrismaTelegramSessionUpsert.mock.calls[0][0];
    expect(upsertCall.create.sessionString).not.toBe('2fa-session');
    expect(decryptSession(upsertCall.create.sessionString as string)).toBe('2fa-session');
    expect(mockPrismaAuditEventCreate).toHaveBeenCalledOnce();
    const auditCall = mockPrismaAuditEventCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe('TELEGRAM_SESSION_LINKED');
  });

  it('AC-2: getSessionStatus returns linked=true when session row exists', async () => {
    const { getSessionStatus } = await import('@/lib/ordering/application/TelegramAuthService');

    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce({ id: 'ts-1', isActive: true });

    const status = await getSessionStatus('user-1');
    expect(status.linked).toBe(true);
  });

  it('AC-2: getSessionStatus returns linked=false when no session row exists', async () => {
    const { getSessionStatus } = await import('@/lib/ordering/application/TelegramAuthService');

    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce(null);

    const status = await getSessionStatus('user-1');
    expect(status.linked).toBe(false);
  });

  it('AC-3: manual fallback deep-link is always constructable from vendorTelegramUsername', async () => {
    const { buildFallbackDeepLink } = await import('@/lib/ordering/application/TelegramAuthService');
    const link = buildFallbackDeepLink('qsc_vendor');
    expect(link).toBe('tg://resolve?domain=qsc_vendor');
  });
});

/**
 * Story: US-ORD-03 - Build and Send Telegram Order
 */
describe('US-ORD-03: Build and Send Telegram Order', () => {
  it.todo('AC-1: adds items from vendor catalog to cart', () => {
    // Hint: check lib/ordering/domain/Order aggregate
  });

  it.todo('AC-2: dispatches message via linked Telegram account', () => {
    // Hint: check GramJS client integration
  });

  it.todo('AC-3: archives sent message in history', () => {
    // Hint: check telegramMessageId field in Order table
  });
});

/**
 * Story: US-ORD-04 - Payment Confirmation Safety Gate
 */
describe('US-ORD-04: Payment Confirmation Safety Gate', () => {
  it.todo('AC-1: enforces manual entry of wallet and total', () => {
    // Hint: check Zod schema in payment confirm action
  });

  it.todo('AC-2: enables payment button only after verification display', () => {
    // Hint: E2E test for Hard Gate (PRD §6)
  });
});

/**
 * Story: US-ORD-07 - Track Order Status
 */
describe('US-ORD-07: Track Order Status', () => {
  it.todo('AC-1: transitions through state machine (Draft -> Received)', () => {
    // Hint: check lib/ordering/domain/Order invariants
  });

  it.todo('AC-2: flags stale orders after 14 days', () => {
    // Hint: check StaleOrderChecker cron implementation
  });
});
