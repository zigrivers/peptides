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
const mockFindCompoundsByIds = vi.fn();
const mockPrismaOrderCreate = vi.fn();
const mockPrismaOrderFindFirst = vi.fn();
const mockPrismaOrderFindMany = vi.fn();
const mockPrismaOrderUpdateMany = vi.fn();
const mockPrismaOrderItemCreateMany = vi.fn();

const mockStartPhoneAuth = vi.fn();
const mockCompletePhoneAuth = vi.fn();
const mockCompletePhoneAuthWithPassword = vi.fn();
const mockLogoutSession = vi.fn();
const mockSendTelegramMessage = vi.fn();

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
    order: {
      create: mockPrismaOrderCreate,
      findFirst: mockPrismaOrderFindFirst,
      findMany: mockPrismaOrderFindMany,
      updateMany: mockPrismaOrderUpdateMany,
    },
    orderItem: {
      createMany: mockPrismaOrderItemCreateMany,
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
        order: {
          create: mockPrismaOrderCreate,
          findFirst: mockPrismaOrderFindFirst,
          updateMany: mockPrismaOrderUpdateMany,
        },
        orderItem: {
          createMany: mockPrismaOrderItemCreateMany,
        },
        auditEvent: { create: mockPrismaAuditEventCreate },
      };
      return fn(tx);
    }),
  },
}));

vi.mock('@/lib/reference/infrastructure/CompoundRepo', () => ({
  findCompoundsByIds: mockFindCompoundsByIds,
}));

vi.mock('@/lib/ordering/infrastructure/MTProtoClient', () => ({
  startPhoneAuth: mockStartPhoneAuth,
  completePhoneAuth: mockCompletePhoneAuth,
  completePhoneAuthWithPassword: mockCompletePhoneAuthWithPassword,
  logoutSession: mockLogoutSession,
  sendTelegramMessage: mockSendTelegramMessage,
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

    expect(mockPrismaAuditEventCreate).toHaveBeenCalledTimes(2);
    expect(mockPrismaAuditEventCreate.mock.calls[0][0].data.action).toBe('TELEGRAM_SESSION_LINK_INITIATED');
    const auditCall = mockPrismaAuditEventCreate.mock.calls[1][0];
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
    expect(mockPrismaAuditEventCreate).toHaveBeenCalledTimes(2);
    expect(mockPrismaAuditEventCreate.mock.calls[0][0].data.action).toBe('TELEGRAM_SESSION_LINK_INITIATED');
    const auditCall = mockPrismaAuditEventCreate.mock.calls[1][0];
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
 * Story: US-ORD-02 - Build Order (create-draft)
 */
describe('US-ORD-02: Build Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaAuditEventCreate.mockResolvedValue({});
    process.env.TELEGRAM_SESSION_KEY = 'a'.repeat(64);
  });

  it('AC-1: createDraftOrder creates an order with items and writes ORDER_DRAFTED audit', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null); // idempotency check — no existing order
    mockFindCompoundsByIds.mockResolvedValueOnce({ 'cmp-1': 'BPC-157', 'cmp-2': 'TB-500' });
    mockPrismaOrderCreate.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT', idempotencyKey: 'key-1', createdAt: new Date() });
    mockPrismaOrderItemCreateMany.mockResolvedValueOnce({ count: 2 });

    const result = await createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 2 },
      { compoundId: 'cmp-2', compoundName: 'TB-500', form: 'LYOPHILIZED_POWDER', vialSizeMg: '2', quantity: 1 },
    ]);

    expect(result.orderId).toBe('order-1');
    expect(mockPrismaOrderCreate).toHaveBeenCalledOnce();
    expect(mockPrismaOrderItemCreateMany).toHaveBeenCalledOnce();
    expect(mockPrismaAuditEventCreate).toHaveBeenCalledOnce();
    const auditCall = mockPrismaAuditEventCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe('ORDER_DRAFTED');
  });

  it('AC-1: createDraftOrder merges duplicate items (same compoundId+form+vialSizeMg)', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null); // idempotency check — no existing order
    mockFindCompoundsByIds.mockResolvedValueOnce({ 'cmp-1': 'BPC-157' });
    mockPrismaOrderCreate.mockResolvedValueOnce({ id: 'order-2', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT', idempotencyKey: 'key-2', createdAt: new Date() });
    mockPrismaOrderItemCreateMany.mockResolvedValueOnce({ count: 1 });

    await createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 2 },
      // Duplicate — same compound+form+size, should be merged into quantity 3
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
    ]);

    const itemsArg = mockPrismaOrderItemCreateMany.mock.calls[0][0];
    expect(itemsArg.data).toHaveLength(1);
    expect(itemsArg.data[0].quantity).toBe(3);
  });

  it('AC-1: createDraftOrder merges equivalent decimal vialSizeMg strings (5 vs 5.0 vs 5.000)', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);
    mockFindCompoundsByIds.mockResolvedValueOnce({ 'cmp-1': 'BPC-157' });
    mockPrismaOrderCreate.mockResolvedValueOnce({ id: 'order-3', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT', idempotencyKey: 'key-3', createdAt: new Date() });
    mockPrismaOrderItemCreateMany.mockResolvedValueOnce({ count: 1 });

    await createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5.0', quantity: 2 },
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5.000', quantity: 3 },
    ]);

    const itemsArg = mockPrismaOrderItemCreateMany.mock.calls[0][0];
    expect(itemsArg.data).toHaveLength(1);
    expect(itemsArg.data[0].quantity).toBe(6);
    expect(itemsArg.data[0].vialSizeMg).toBe('5'); // normalized form, not raw '5.0' or '5.000'
  });

  it('AC-1: createDraftOrder throws vendor_not_found when vendor does not belong to user', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce(null);

    await expect(createDraftOrder('user-1', 'vendor-other', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
    ])).rejects.toThrow('vendor_not_found');
  });

  it('AC-1: createDraftOrder returns existing orderId when idempotencyKey was already used', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    const dupeKey = '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`;
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-existing', userId: 'user-1', idempotencyKey: dupeKey, status: 'DRAFT' });

    const result = await createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
    ], dupeKey);

    expect(result.orderId).toBe('order-existing');
    expect(mockPrismaOrderCreate).not.toHaveBeenCalled();
  });

  it('AC-1: createDraftOrder throws order_items_required when items array is empty', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(createDraftOrder('user-1', 'vendor-1', [])).rejects.toThrow('order_items_required');
    expect(mockPrismaOrderCreate).not.toHaveBeenCalled();
  });

  it.each([
    { vialSizeMg: '0', label: 'zero' },
    { vialSizeMg: '-5', label: 'negative' },
    { vialSizeMg: 'NaN', label: 'NaN string' },
    { vialSizeMg: 'Infinity', label: 'Infinity string' },
  ])('AC-1: createDraftOrder throws invalid_vial_size for $label vialSizeMg', async ({ vialSizeMg }) => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', form: 'LYOPHILIZED_POWDER', vialSizeMg, quantity: 1 },
    ])).rejects.toThrow('invalid_vial_size');
    expect(mockPrismaOrderCreate).not.toHaveBeenCalled();
  });

  it.each([
    { quantity: 0, label: 'zero' },
    { quantity: -1, label: 'negative' },
    { quantity: 1.5, label: 'fractional' },
  ])('AC-1: createDraftOrder throws invalid_quantity for $label quantity', async ({ quantity }) => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity },
    ])).rejects.toThrow('invalid_quantity');
    expect(mockPrismaOrderCreate).not.toHaveBeenCalled();
  });

  it('AC-1: createDraftOrder throws compound_not_found when compoundId does not exist', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);
    mockFindCompoundsByIds.mockResolvedValueOnce({}); // compound does not exist

    await expect(createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'bad-id', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
    ])).rejects.toThrow('compound_not_found');
    expect(mockPrismaOrderCreate).not.toHaveBeenCalled();
  });

  it('AC-1: createDraftOrder throws product_compound_mismatch when productId maps to a different compound', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);
    mockFindCompoundsByIds.mockResolvedValueOnce({ 'cmp-1': 'BPC-157' });
    mockPrismaOrderCreate.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT', idempotencyKey: 'key-1', createdAt: new Date() });
    // Product exists but its compoundId doesn't match the line item's compoundId
    mockPrismaVendorProductFindMany.mockResolvedValueOnce([{ id: 'prod-1', compoundId: 'different-compound' }]);

    await expect(createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1, productId: 'prod-1' },
    ])).rejects.toThrow('product_compound_mismatch');
  });

  it('AC-1: createDraftOrder recovers from P2002 race on idempotencyKey unique constraint', async () => {
    const { createDraftOrder } = await import('@/lib/ordering/application/OrderService');

    mockPrismaVendorFindFirst.mockResolvedValueOnce({
      id: 'vendor-1', userId: 'user-1', name: 'QSC', telegramUsername: 'qsc_vendor',
      messageTemplate: null, preferredCurrency: 'USDT', status: 'ACTIVE', createdAt: new Date(),
    });
    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(null) // idempotency pre-check misses (race)
      .mockResolvedValueOnce({ id: 'order-winner', userId: 'user-1', status: 'DRAFT' }); // re-read after P2002
    mockFindCompoundsByIds.mockResolvedValueOnce({ 'cmp-1': 'BPC-157' });

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrismaOrderCreate.mockRejectedValueOnce(p2002);

    const dupeKey = '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`;
    const result = await createDraftOrder('user-1', 'vendor-1', [
      { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: '5', quantity: 1 },
    ], dupeKey);

    expect(result.orderId).toBe('order-winner');
  });
});

/**
 * Story: US-ORD-03 - Build and Send Telegram Order
 */
describe('US-ORD-03: Build and Send Telegram Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaAuditEventCreate.mockResolvedValue({});
    process.env.TELEGRAM_SESSION_KEY = 'a'.repeat(64);
    process.env.TELEGRAM_APP_ID = '12345';
    process.env.TELEGRAM_APP_HASH = 'abc123hash';
  });

  it('AC-2: sendOrder sends via AUTOMATED when Telegram session is linked', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');
    const { encryptSession } = await import('@/lib/ordering/application/SessionManager');

    const encryptedSession = encryptSession('plain-session');
    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 2 },
      ],
    };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails) // get order for sendOrder
      .mockResolvedValueOnce(null);            // no recent duplicate

    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce({ sessionString: encryptedSession, isActive: true, userId: 'user-1' });
    mockSendTelegramMessage.mockResolvedValueOnce({ messageId: 'tg-msg-123' });
    mockPrismaOrderUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // pre-send reserve
      .mockResolvedValueOnce({ count: 1 }); // finalize inside withAudit tx

    const result = await sendOrder('user-1', 'order-1');

    expect(result.sendMethod).toBe('AUTOMATED');
    expect(result.telegramMessageId).toBe('tg-msg-123');
    expect(mockSendTelegramMessage).toHaveBeenCalledWith('plain-session', 'qsc_vendor', expect.any(String));
  });

  it('AC-2: sendOrder falls back to MANUAL_FALLBACK when no Telegram session is linked', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');

    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 1 },
      ],
    };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails)
      .mockResolvedValueOnce(null);
    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce(null);
    mockPrismaOrderUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // pre-send reserve
      .mockResolvedValueOnce({ count: 1 }); // finalize inside withAudit tx

    const result = await sendOrder('user-1', 'order-1');

    expect(result.sendMethod).toBe('MANUAL_FALLBACK');
    expect(result.fallbackDeepLink).toBe('tg://resolve?domain=qsc_vendor');
    expect(result.fallbackText).toBeTruthy();
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('AC-3: sendOrder archives messageText to the order record on reservation', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');

    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 2 },
      ],
    };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails)
      .mockResolvedValueOnce(null);
    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce(null);
    mockPrismaOrderUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // pre-send reserve
      .mockResolvedValueOnce({ count: 1 }); // MANUAL_FALLBACK: stamp sendMethod on DRAFT

    await sendOrder('user-1', 'order-1');

    // First updateMany call = pre-send slot reservation (messageText + sentAt)
    const reserveCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(reserveCall.data.messageText).toBeTruthy();
    expect(reserveCall.data.sentAt).toBeInstanceOf(Date);
    // Second updateMany call = MANUAL_FALLBACK path: stamps sendMethod, does NOT set SENT
    const fallbackCall = mockPrismaOrderUpdateMany.mock.calls[1][0];
    expect(fallbackCall.data.sendMethod).toBe('MANUAL_FALLBACK');
    expect(fallbackCall.data.status).toBeUndefined();
  });

  it('AC-3: sendOrder writes ORDER_MANUAL_FALLBACK_PROVIDED (not ORDER_SENT) on fallback path', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');

    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 1 },
      ],
    };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails)
      .mockResolvedValueOnce(null);
    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce(null);
    mockPrismaOrderUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await sendOrder('user-1', 'order-1');

    const auditActions = mockPrismaAuditEventCreate.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { action: string } }).data.action
    );
    expect(auditActions).toContain('ORDER_MANUAL_FALLBACK_PROVIDED');
    expect(auditActions).not.toContain('ORDER_SENT');
  });

  it('AC-3: sendOrder blocks duplicate send within 60 seconds without force', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');

    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 1 },
      ],
    };
    const recentDuplicate = { id: 'order-0', sentAt: new Date(), messageText: 'same' };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails)  // get order
      .mockResolvedValueOnce(recentDuplicate);  // duplicate check finds one

    await expect(sendOrder('user-1', 'order-1')).rejects.toThrow('possible_duplicate_send');
    // Audit DUPLICATE_SEND_BLOCKED should be written
    const auditActions = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: { action: string } }).data.action);
    expect(auditActions).toContain('DUPLICATE_SEND_BLOCKED');
  });

  it('AC-3: sendOrder proceeds past 60s duplicate check when force=true', async () => {
    const { sendOrder } = await import('@/lib/ordering/application/OrderService');

    const orderWithDetails = {
      id: 'order-1', userId: 'user-1', vendorId: 'vendor-1', status: 'DRAFT',
      idempotencyKey: 'key-1', createdAt: new Date(), sentAt: null, messageText: null,
      vendor: { id: 'vendor-1', telegramUsername: 'qsc_vendor', name: 'QSC', preferredCurrency: 'USDT', messageTemplate: null },
      items: [
        { compoundId: 'cmp-1', compoundName: 'BPC-157', form: 'LYOPHILIZED_POWDER', vialSizeMg: { toString: () => '5' }, quantity: 1 },
      ],
    };
    const recentDuplicate = { id: 'order-0', sentAt: new Date(), messageText: 'same' };

    mockPrismaOrderFindFirst
      .mockResolvedValueOnce(orderWithDetails)
      .mockResolvedValueOnce(recentDuplicate); // duplicate found, but force=true
    mockPrismaTelegramSessionFindUnique.mockResolvedValueOnce(null);
    mockPrismaOrderUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // pre-send reserve
      .mockResolvedValueOnce({ count: 1 }); // finalize inside withAudit tx

    const result = await sendOrder('user-1', 'order-1', true);
    expect(result.sendMethod).toBe('MANUAL_FALLBACK');
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
