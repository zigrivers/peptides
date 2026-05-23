import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const mockPrismaOrderFindFirst = vi.fn();
const mockPrismaOrderFindMany = vi.fn();
const mockPrismaOrderUpdateMany = vi.fn();
const mockPrismaAuditEventCreate = vi.fn();
const mockPrismaTx = {
  order: {
    findFirst: mockPrismaOrderFindFirst,
    findMany: mockPrismaOrderFindMany,
    updateMany: mockPrismaOrderUpdateMany,
  },
  auditEvent: { create: mockPrismaAuditEventCreate },
};

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: typeof mockPrismaTx) => Promise<unknown>) => cb(mockPrismaTx)),
    order: {
      findFirst: mockPrismaOrderFindFirst,
      findMany: mockPrismaOrderFindMany,
      updateMany: mockPrismaOrderUpdateMany,
    },
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

// --- Tests ---

describe('cancelOrder', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: cancels a DRAFT order — sets status, cancelledAt, cancelledByUserId', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'DRAFT' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await cancelOrder('user-1', 'order-1');

    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CANCELLED');
    expect(updateCall.data.cancelledByUserId).toBe('user-1');
    expect(updateCall.data.cancelledAt).toBeInstanceOf(Date);
  });

  it('AC-2: cancels a SENT order', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'SENT' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(cancelOrder('user-1', 'order-1')).resolves.toBeUndefined();
  });

  it('AC-3: cancels a CONFIRMED order', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'CONFIRMED' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(cancelOrder('user-1', 'order-1')).resolves.toBeUndefined();
  });

  it('AC-4: cancels a STALE order', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'STALE' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(cancelOrder('user-1', 'order-1')).resolves.toBeUndefined();
  });

  it('AC-5: rejects cancel from RECEIVED terminal status', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'RECEIVED' });

    await expect(cancelOrder('user-1', 'order-1')).rejects.toThrow('invalid_order_transition');
  });

  it('AC-6: rejects cancel from CANCELLED terminal status', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'CANCELLED' });

    await expect(cancelOrder('user-1', 'order-1')).rejects.toThrow('invalid_order_transition');
  });

  it('AC-7: audits ORDER_CANCELLED with oldValues and newValues', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce({ id: 'order-1', userId: 'user-1', status: 'SENT' });
    mockPrismaOrderUpdateMany.mockResolvedValueOnce({ count: 1 });

    await cancelOrder('user-1', 'order-1');

    const auditCalls = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data);
    const cancelAudit = auditCalls.find((d: unknown) => (d as { action: string }).action === 'ORDER_CANCELLED');
    expect(cancelAudit).toBeDefined();
    expect((cancelAudit as { oldValues: { status: string } }).oldValues.status).toBe('SENT');
    expect((cancelAudit as { newValues: { status: string } }).newValues.status).toBe('CANCELLED');
  });

  it('AC-8: userId scoping — order not found throws order_not_found', async () => {
    const { cancelOrder } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindFirst.mockResolvedValueOnce(null);

    await expect(cancelOrder('user-1', 'order-other')).rejects.toThrow('order_not_found');
  });
});

describe('markOrdersStale', () => {
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: marks SENT orders with sentAt > 14 days ago as STALE', async () => {
    const { markOrdersStale } = await import('@/lib/ordering/application/OrderService');
    const now = new Date('2026-06-05T09:00:00Z');
    const oldSentAt = new Date(now.getTime() - FOURTEEN_DAYS_MS - 1000);
    const staleOrder = { id: 'order-1', userId: 'user-1', status: 'SENT', sentAt: oldSentAt };

    mockPrismaOrderFindMany.mockResolvedValueOnce([staleOrder]);
    mockPrismaOrderUpdateMany.mockResolvedValue({ count: 1 });

    const count = await markOrdersStale(now);

    expect(count).toBe(1);
    const updateCall = mockPrismaOrderUpdateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('STALE');
    expect(updateCall.data.staleFlaggedAt).toBeInstanceOf(Date);
  });

  it('AC-2: leaves SENT orders within 14 days untouched', async () => {
    const { markOrdersStale } = await import('@/lib/ordering/application/OrderService');
    const now = new Date('2026-06-05T09:00:00Z');
    mockPrismaOrderFindMany.mockResolvedValueOnce([]); // no orders beyond cutoff

    const count = await markOrdersStale(now);

    expect(count).toBe(0);
    expect(mockPrismaOrderUpdateMany).not.toHaveBeenCalled();
  });

  it('AC-3: leaves non-SENT statuses untouched (findMany filters by status=SENT)', async () => {
    const { markOrdersStale } = await import('@/lib/ordering/application/OrderService');
    const now = new Date('2026-06-05T09:00:00Z');
    mockPrismaOrderFindMany.mockResolvedValueOnce([]);

    await markOrdersStale(now);

    const findCall = mockPrismaOrderFindMany.mock.calls[0][0];
    expect(findCall.where.status).toBe('SENT');
  });

  it('AC-4: audits ORDER_MARKED_STALE per staled order', async () => {
    const { markOrdersStale } = await import('@/lib/ordering/application/OrderService');
    const now = new Date('2026-06-05T09:00:00Z');
    const staleOrder = { id: 'order-1', userId: 'user-1', status: 'SENT', sentAt: new Date(now.getTime() - FOURTEEN_DAYS_MS - 1000) };

    mockPrismaOrderFindMany.mockResolvedValueOnce([staleOrder]);
    mockPrismaOrderUpdateMany.mockResolvedValue({ count: 1 });

    await markOrdersStale(now);

    const auditCalls = mockPrismaAuditEventCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data);
    const staleAudit = auditCalls.find((d: unknown) => (d as { action: string }).action === 'ORDER_MARKED_STALE');
    expect(staleAudit).toBeDefined();
  });

  it('AC-5: returns the count of orders staled', async () => {
    const { markOrdersStale } = await import('@/lib/ordering/application/OrderService');
    const now = new Date('2026-06-05T09:00:00Z');
    const makeStale = (id: string) => ({ id, userId: 'user-1', status: 'SENT', sentAt: new Date(now.getTime() - FOURTEEN_DAYS_MS - 1000) });

    mockPrismaOrderFindMany.mockResolvedValueOnce([makeStale('o1'), makeStale('o2'), makeStale('o3')]);
    mockPrismaOrderUpdateMany.mockResolvedValue({ count: 1 });

    const count = await markOrdersStale(now);
    expect(count).toBe(3);
  });
});

describe('listOrders', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('AC-1: returns orders for userId only, sorted by createdAt desc', async () => {
    const { listOrders } = await import('@/lib/ordering/application/OrderService');
    mockPrismaOrderFindMany.mockResolvedValueOnce([
      {
        id: 'order-1', status: 'SENT', createdAt: new Date('2026-06-04'), sentAt: new Date('2026-06-04'),
        cancelledAt: null, staleFlaggedAt: null,
        vendor: { name: 'QSC' },
        items: [{ id: 'item-1' }, { id: 'item-2' }],
      },
    ]);

    const results = await listOrders('user-1');

    const findCall = mockPrismaOrderFindMany.mock.calls[0][0];
    expect(findCall.where.userId).toBe('user-1');
    expect(findCall.orderBy).toEqual({ createdAt: 'desc' });
    expect(results).toHaveLength(1);
    expect(results[0].vendorName).toBe('QSC');
    expect(results[0].itemCount).toBe(2);
  });

  it('AC-2: includes status, vendorName, itemCount, createdAt, sentAt, cancelledAt, staleFlaggedAt', async () => {
    const { listOrders } = await import('@/lib/ordering/application/OrderService');
    const createdAt = new Date('2026-06-04');
    const sentAt = new Date('2026-06-04');
    mockPrismaOrderFindMany.mockResolvedValueOnce([
      {
        id: 'order-2', status: 'CANCELLED', createdAt, sentAt,
        cancelledAt: new Date('2026-06-05'), staleFlaggedAt: null,
        vendor: { name: 'PepVend' },
        items: [],
      },
    ]);

    const [order] = await listOrders('user-1');
    expect(order.id).toBe('order-2');
    expect(order.status).toBe('CANCELLED');
    expect(order.vendorName).toBe('PepVend');
    expect(order.itemCount).toBe(0);
    expect(order.createdAt).toBe(createdAt);
    expect(order.sentAt).toBe(sentAt);
    expect(order.cancelledAt).toBeInstanceOf(Date);
    expect(order.staleFlaggedAt).toBeNull();
  });
});
