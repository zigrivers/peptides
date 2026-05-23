import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// --- Mocks ---

const mockPrismaOrderFindFirst = vi.fn();
const mockPrismaOrderFindMany = vi.fn();
const mockPrismaOrderUpdateMany = vi.fn();
const mockPrismaOrderUpdate = vi.fn();
const mockPrismaVialCreateMany = vi.fn();
const mockPrismaAuditEventCreate = vi.fn();
const mockPrismaTx = {
  order: {
    findFirst: mockPrismaOrderFindFirst,
    updateMany: mockPrismaOrderUpdateMany,
    update: mockPrismaOrderUpdate,
  },
  vial: { createMany: mockPrismaVialCreateMany },
  auditEvent: { create: mockPrismaAuditEventCreate },
};

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: typeof mockPrismaTx) => Promise<unknown>) => cb(mockPrismaTx)),
    order: {
      findFirst: mockPrismaOrderFindFirst,
      findMany: mockPrismaOrderFindMany,
      updateMany: mockPrismaOrderUpdateMany,
      update: mockPrismaOrderUpdate,
    },
    vial: { createMany: mockPrismaVialCreateMany },
    auditEvent: { create: mockPrismaAuditEventCreate },
  },
}));

vi.mock('@/lib/audit/application/withAudit', () => ({
  withAudit: vi.fn(async (mutation: (tx: typeof mockPrismaTx) => Promise<unknown>, meta: () => unknown) => {
    const result = await mutation(mockPrismaTx);
    mockPrismaAuditEventCreate({ data: meta() });
    return result;
  }),
}));

// --- confirmQuote ---

describe('confirmQuote', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: saves walletAddress, amount, currency and transitions SENT → CONFIRMED', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'SENT' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await confirmQuote('user-1', 'order-1', {
      walletAddress: 'TAddr123',
      amount: '50.00',
      currency: 'USDT',
    });

    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CONFIRMED');
    expect(updateCall.data.paymentConfirmation).toMatchObject({
      walletAddress: 'TAddr123',
      amount: '50.00',
      currency: 'USDT',
    });
    expect(updateCall.data.confirmedAt).toBeInstanceOf(Date);
  });

  it('AC-2: throws order_not_found for unknown order or wrong user', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(
      confirmQuote('user-1', 'order-bad', { walletAddress: 'x', amount: '10', currency: 'USDT' })
    ).rejects.toThrow('order_not_found');
  });

  it('AC-3: throws invalid_order_transition for terminal/uneditable statuses (e.g. DRAFT)', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'DRAFT' });

    await expect(
      confirmQuote('user-1', 'order-1', { walletAddress: 'x', amount: '10', currency: 'USDT' })
    ).rejects.toThrow('invalid_order_transition');
  });

  it('AC-3b: allows STALE → CONFIRMED transition (recoverable late reply)', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'STALE' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      confirmQuote('user-1', 'order-1', { walletAddress: 'TAddr', amount: '50.00', currency: 'USDT' })
    ).resolves.toBeUndefined();
  });

  it('AC-3c: allows CONFIRMED → CONFIRMED re-confirmation (correct wrong wallet before payment)', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'CONFIRMED',
      paymentConfirmation: { walletAddress: 'TAddr_old', amount: '50', currency: 'USDT' },
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      confirmQuote('user-1', 'order-1', { walletAddress: 'TAddr_new', amount: '50.00', currency: 'USDT' })
    ).resolves.toBeUndefined();

    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.paymentConfirmation.walletAddress).toBe('TAddr_new');
    expect(updateCall.data.status).toBe('CONFIRMED');
  });

  it('AC-4: audits ORDER_CONFIRMED with old and new values', async () => {
    const { confirmQuote } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'SENT' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await confirmQuote('user-1', 'order-1', { walletAddress: 'TAddr123', amount: '50.00', currency: 'USDT' });

    const auditCalls = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data);
    const audit = auditCalls.find((d: unknown) => (d as { action: string }).action === 'ORDER_CONFIRMED');
    expect(audit).toBeDefined();
    expect((audit as { oldValues: { status: string } }).oldValues.status).toBe('SENT');
    expect((audit as { newValues: { status: string } }).newValues.status).toBe('CONFIRMED');
  });
});

// --- markPaymentSent ---

describe('markPaymentSent', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: transitions CONFIRMED → PAYMENT_SENT and sets paymentSentAt', async () => {
    const { markPaymentSent } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'CONFIRMED',
      paymentConfirmation: { walletAddress: 'TAddr', amount: '50', currency: 'USDT' },
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await markPaymentSent('user-1', 'order-1');

    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('PAYMENT_SENT');
    expect(updateCall.data.paymentSentAt).toBeInstanceOf(Date);
  });

  it('AC-2: throws order_not_found if order does not exist', async () => {
    const { markPaymentSent } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(markPaymentSent('user-1', 'order-1')).rejects.toThrow('order_not_found');
  });

  it('AC-3: throws invalid_order_transition if order is not CONFIRMED', async () => {
    const { markPaymentSent } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'SENT', paymentConfirmation: null });

    await expect(markPaymentSent('user-1', 'order-1')).rejects.toThrow('invalid_order_transition');
  });

  it('AC-4: throws payment_not_confirmed if paymentConfirmation is null', async () => {
    const { markPaymentSent } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'CONFIRMED', paymentConfirmation: null });

    await expect(markPaymentSent('user-1', 'order-1')).rejects.toThrow('payment_not_confirmed');
  });

  it('AC-5: audits ORDER_PAYMENT_SENT', async () => {
    const { markPaymentSent } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'CONFIRMED',
      paymentConfirmation: { walletAddress: 'TAddr', amount: '50', currency: 'USDT' },
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await markPaymentSent('user-1', 'order-1');

    const auditCalls = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data);
    const audit = auditCalls.find((d: unknown) => (d as { action: string }).action === 'ORDER_PAYMENT_SENT');
    expect(audit).toBeDefined();
  });
});

// --- receiveOrder ---

describe('receiveOrder', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: transitions PAYMENT_SENT → RECEIVED and sets receivedAt', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'PAYMENT_SENT',
      items: [{ id: 'item-1', compoundId: 'c-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: new Decimal('5'), quantity: 2 }],
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaVialCreateMany.mockResolvedValueOnce({ count: 2 });

    await receiveOrder('user-1', 'order-1');

    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('RECEIVED');
    expect(updateCall.data.receivedAt).toBeInstanceOf(Date);
  });

  it('AC-2: creates one Vial per quantity unit per OrderItem linked by orderItemId', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'PAYMENT_SENT',
      items: [
        { id: 'item-1', compoundId: 'c-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: new Decimal('5'), quantity: 2 },
        { id: 'item-2', compoundId: 'c-2', form: 'LYOPHILIZED_POWDER', vialSizeMg: new Decimal('10'), quantity: 1 },
      ],
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaVialCreateMany.mockResolvedValueOnce({ count: 3 });

    await receiveOrder('user-1', 'order-1');

    const createManyCall = mockPrismaVialCreateMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(3);
    const item1Vials = createManyCall.data.filter((v: { orderItemId: string }) => v.orderItemId === 'item-1');
    expect(item1Vials).toHaveLength(2);
    expect(item1Vials[0].totalMg.toString()).toBe('5');
    const item2Vials = createManyCall.data.filter((v: { orderItemId: string }) => v.orderItemId === 'item-2');
    expect(item2Vials).toHaveLength(1);
    expect(item2Vials[0].totalMg.toString()).toBe('10');
  });

  it('AC-3: throws order_not_found if order does not exist', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(receiveOrder('user-1', 'order-1')).rejects.toThrow('order_not_found');
  });

  it('AC-4: throws invalid_order_transition if order is not PAYMENT_SENT', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'CONFIRMED', items: [],
    });

    await expect(receiveOrder('user-1', 'order-1')).rejects.toThrow('invalid_order_transition');
  });

  it('AC-6: idempotent — already RECEIVED order returns without error or duplicate vials', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'RECEIVED', items: [],
    });

    await expect(receiveOrder('user-1', 'order-1')).resolves.toBeUndefined();
    expect(mockPrismaVialCreateMany).not.toHaveBeenCalled();
  });

  it('AC-2b: SOLUTION items create RECONSTITUTED vials (not DRY)', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'PAYMENT_SENT',
      items: [
        { id: 'item-1', compoundId: 'c-1', form: 'SOLUTION', vialSizeMg: new Decimal('5'), quantity: 1 },
        { id: 'item-2', compoundId: 'c-2', form: 'LYOPHILIZED_POWDER', vialSizeMg: new Decimal('10'), quantity: 1 },
      ],
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaVialCreateMany.mockResolvedValueOnce({ count: 2 });

    await receiveOrder('user-1', 'order-1');

    const createManyCall = mockPrismaVialCreateMany.mock.calls[0][0];
    const solutionVial = createManyCall.data.find((v: { orderItemId: string }) => v.orderItemId === 'item-1');
    const powderVial = createManyCall.data.find((v: { orderItemId: string }) => v.orderItemId === 'item-2');
    expect(solutionVial.status).toBe('RECONSTITUTED');
    expect(solutionVial.reconstitutedAt).toBeInstanceOf(Date);
    expect(solutionVial.expiresAt).toBeInstanceOf(Date);
    expect(powderVial.status).toBe('DRY');
    expect(powderVial.reconstitutedAt).toBeUndefined();
    expect(powderVial.expiresAt).toBeUndefined();
  });

  it('AC-5: audits ORDER_RECEIVED', async () => {
    const { receiveOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1', userId: 'user-1', status: 'PAYMENT_SENT',
      items: [{ id: 'item-1', compoundId: 'c-1', form: 'LYOPHILIZED_POWDER', vialSizeMg: new Decimal('5'), quantity: 1 }],
    });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaVialCreateMany.mockResolvedValueOnce({ count: 1 });

    await receiveOrder('user-1', 'order-1');

    const auditCalls = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data);
    const audit = auditCalls.find((d: unknown) => (d as { action: string }).action === 'ORDER_RECEIVED');
    expect(audit).toBeDefined();
  });
});

// --- getPriorWalletAddress ---

describe('getPriorWalletAddress', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: returns wallet address from most recent prior confirmed order to same vendor', async () => {
    const { getPriorWalletAddress } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindMany.mockResolvedValueOnce([
      { paymentConfirmation: { walletAddress: 'TAddr_prior', amount: '40', currency: 'USDT' } },
    ]);

    const result = await getPriorWalletAddress('user-1', 'vendor-1');

    expect(result).toBe('TAddr_prior');
  });

  it('AC-2: returns null when no prior confirmed orders exist', async () => {
    const { getPriorWalletAddress } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindMany.mockResolvedValueOnce([]);

    const result = await getPriorWalletAddress('user-1', 'vendor-1');

    expect(result).toBeNull();
  });

  it('AC-3: excludes the current order so the stale-wallet warning is not suppressed', async () => {
    const { getPriorWalletAddress } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindMany.mockResolvedValueOnce([
      { paymentConfirmation: { walletAddress: 'TAddr_old', amount: '40', currency: 'USDT' } },
    ]);

    const result = await getPriorWalletAddress('user-1', 'vendor-1', 'current-order-id');

    const findCall = mockPrismaOrderFindMany.mock.calls[0][0];
    expect(findCall.where.id).toEqual({ not: 'current-order-id' });
    expect(result).toBe('TAddr_old');
  });
});
