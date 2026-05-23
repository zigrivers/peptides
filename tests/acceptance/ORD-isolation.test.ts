/**
 * Story: US-ORD-08 — Ordering Module Isolation (Non-Functional)
 * ADR-015 — Bounded Context Isolation for Ordering
 *
 * Tests the DISABLE_ORDERING feature flag end-to-end at every gate point:
 *   - lib/shared/featureFlags.ts (helpers)
 *   - app/actions/ordering/*.ts (server actions throw)
 *   - app/api/cron/stale-orders/route.ts (cron no-op)
 *
 * Middleware-level 404 behavior is not unit-testable inside Vitest (needs
 * an integration runner); it's verified by code review + manual smoke per
 * the plan's test plan section.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks for downstream service imports so the action modules can be
// imported without hitting a real DB. The action guard runs BEFORE these
// services are called, so the mocks only matter for the flag-off happy path.
const mockMarkOrdersStale = vi.fn();
const mockAuth = vi.fn();
const mockCreateRateLimiter = vi.fn(() => ({ check: vi.fn().mockResolvedValue({ allowed: true }) }));

vi.mock('@/lib/ordering/application/OrderService', () => ({
  markOrdersStale: mockMarkOrdersStale,
  cancelOrder: vi.fn(),
  confirmQuote: vi.fn(),
  markPaymentSent: vi.fn(),
  receiveOrder: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/shared/rateLimiter', () => ({ createRateLimiter: mockCreateRateLimiter }));

// Services called by the various action modules (only their function names
// need to exist; bodies are stubbed since the flag-on path throws before
// any service call).
vi.mock('@/lib/ordering/application/VendorService', () => ({
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  disableVendor: vi.fn(),
}));
vi.mock('@/lib/ordering/application/VendorProductService', () => ({
  createVendorProduct: vi.fn(),
  updateVendorProduct: vi.fn(),
  archiveVendorProduct: vi.fn(),
}));
vi.mock('@/lib/ordering/application/TelegramAuthService', () => ({
  initiateTelegramLink: vi.fn(),
  completeTelegramLink: vi.fn(),
  completeTelegramLinkWithPassword: vi.fn(),
  unlinkTelegram: vi.fn(),
  getSessionStatus: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// --- Imports happen at top-level so the module factories above are bound
// before the imported modules try to resolve their dependencies.
const { isOrderingDisabled, assertOrderingEnabled } = await import('@/lib/shared/featureFlags');
const vendorActions = await import('@/app/actions/ordering/vendor');
const vendorProductActions = await import('@/app/actions/ordering/vendor-product');
const telegramActions = await import('@/app/actions/ordering/telegram-auth');
const orderLifecycleActions = await import('@/app/(dashboard)/ordering/orders/_actions');
const cronRoute = await import('@/app/api/cron/stale-orders/route');

/**
 * US-ORD-08 AC-1 / AC-2 / AC-3 covered indirectly by these helpers + the
 * action/cron tests below. The middleware-level 404 behavior is covered by
 * code review on `middleware.ts` (the regex is short and explicit).
 */

describe('US-ORD-08: isOrderingDisabled', () => {
  it('returns false when DISABLE_ORDERING is unset', () => {
    vi.stubEnv('DISABLE_ORDERING', '');
    // empty string is still set in process.env on some shells; force unset
    delete process.env.DISABLE_ORDERING;
    expect(isOrderingDisabled()).toBe(false);
  });

  it('returns true only for the exact string "true"', () => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
    expect(isOrderingDisabled()).toBe(true);
  });

  it('returns false for "false"', () => {
    vi.stubEnv('DISABLE_ORDERING', 'false');
    expect(isOrderingDisabled()).toBe(false);
  });

  it('returns false for case-variants like "TRUE" and "True"', () => {
    vi.stubEnv('DISABLE_ORDERING', 'TRUE');
    expect(isOrderingDisabled()).toBe(false);
    vi.stubEnv('DISABLE_ORDERING', 'True');
    expect(isOrderingDisabled()).toBe(false);
  });

  it('returns false for "1" and "yes" (only exact "true" works)', () => {
    vi.stubEnv('DISABLE_ORDERING', '1');
    expect(isOrderingDisabled()).toBe(false);
    vi.stubEnv('DISABLE_ORDERING', 'yes');
    expect(isOrderingDisabled()).toBe(false);
  });
});

describe('US-ORD-08: assertOrderingEnabled', () => {
  it('throws "ordering_disabled" when flag is on', () => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
    expect(() => assertOrderingEnabled()).toThrow('ordering_disabled');
  });

  it('does not throw when flag is off', () => {
    vi.stubEnv('DISABLE_ORDERING', 'false');
    expect(() => assertOrderingEnabled()).not.toThrow();
  });
});

describe('US-ORD-08: vendor server actions are gated', () => {
  beforeEach(() => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
  });

  it('createVendorAction throws ordering_disabled', async () => {
    await expect(
      vendorActions.createVendorAction({
        name: 'x',
        telegramUsername: 'x',
        preferredCurrency: 'USDT',
      })
    ).rejects.toThrow('ordering_disabled');
  });

  it('updateVendorAction throws ordering_disabled', async () => {
    await expect(vendorActions.updateVendorAction('vendor-1', { name: 'x' })).rejects.toThrow('ordering_disabled');
  });

  it('disableVendorAction throws ordering_disabled', async () => {
    await expect(vendorActions.disableVendorAction('vendor-1')).rejects.toThrow('ordering_disabled');
  });
});

describe('US-ORD-08: vendor product server actions are gated', () => {
  beforeEach(() => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
  });

  it('createVendorProductAction throws ordering_disabled', async () => {
    await expect(
      vendorProductActions.createVendorProductAction({
        vendorId: 'v',
        compoundId: 'c',
        name: 'p',
        priceUsd: '1.00',
        inStock: true,
      })
    ).rejects.toThrow('ordering_disabled');
  });

  it('updateVendorProductAction throws ordering_disabled', async () => {
    await expect(
      vendorProductActions.updateVendorProductAction('product-1', 'vendor-1', { name: 'x' })
    ).rejects.toThrow('ordering_disabled');
  });

  it('archiveVendorProductAction throws ordering_disabled', async () => {
    await expect(vendorProductActions.archiveVendorProductAction('product-1', 'vendor-1')).rejects.toThrow('ordering_disabled');
  });
});

describe('US-ORD-08: telegram-auth server actions are gated', () => {
  beforeEach(() => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
  });

  it('initiateTelegramLinkAction throws ordering_disabled', async () => {
    await expect(telegramActions.initiateTelegramLinkAction({ phone: '+15551234567' })).rejects.toThrow('ordering_disabled');
  });

  it('completeTelegramLinkAction throws ordering_disabled', async () => {
    await expect(
      telegramActions.completeTelegramLinkAction({
        phone: '+15551234567',
        phoneCodeHash: 'hash',
        code: '12345',
        flowId: '00000000-0000-0000-0000-000000000001',
      })
    ).rejects.toThrow('ordering_disabled');
  });

  it('completeTelegramLinkWithPasswordAction throws ordering_disabled', async () => {
    await expect(
      telegramActions.completeTelegramLinkWithPasswordAction({
        flowId: '00000000-0000-0000-0000-000000000001',
        password: 'pw',
      })
    ).rejects.toThrow('ordering_disabled');
  });

  it('unlinkTelegramAction throws ordering_disabled', async () => {
    await expect(telegramActions.unlinkTelegramAction()).rejects.toThrow('ordering_disabled');
  });

  it('getTelegramStatusAction throws ordering_disabled', async () => {
    await expect(telegramActions.getTelegramStatusAction()).rejects.toThrow('ordering_disabled');
  });
});

describe('US-ORD-08: order lifecycle server actions are gated', () => {
  beforeEach(() => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
  });

  it('cancelOrderAction throws ordering_disabled', async () => {
    await expect(orderLifecycleActions.cancelOrderAction('order-1')).rejects.toThrow('ordering_disabled');
  });

  it('confirmQuoteAction throws ordering_disabled', async () => {
    const fd = new FormData();
    fd.set('walletAddress', '0xabc');
    fd.set('amount', '1.00');
    fd.set('currency', 'USDT');
    await expect(orderLifecycleActions.confirmQuoteAction('order-1', null, fd)).rejects.toThrow('ordering_disabled');
  });

  it('markPaymentSentAction throws ordering_disabled', async () => {
    const fd = new FormData();
    fd.set('acknowledged', 'true');
    await expect(orderLifecycleActions.markPaymentSentAction('order-1', null, fd)).rejects.toThrow('ordering_disabled');
  });

  it('receiveOrderAction throws ordering_disabled', async () => {
    await expect(orderLifecycleActions.receiveOrderAction('order-1', null, new FormData())).rejects.toThrow('ordering_disabled');
  });
});

describe('US-ORD-08: /api/cron/stale-orders is a no-op when flag is on', () => {
  function makeReq(authHeader: string | null) {
    return new Request('http://localhost/api/cron/stale-orders', {
      method: 'POST',
      headers: authHeader ? { authorization: authHeader } : {},
    });
  }

  it('returns 200 { skipped: true, reason: "ordering_disabled" } with valid CRON_SECRET when flag is on', async () => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const res = await cronRoute.POST(makeReq('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: true, reason: 'ordering_disabled' });
    expect(mockMarkOrdersStale).not.toHaveBeenCalled();
  });

  it('still returns 401 without CRON_SECRET even when flag is on (auth precedes flag check)', async () => {
    vi.stubEnv('DISABLE_ORDERING', 'true');
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const res = await cronRoute.POST(makeReq(null));
    expect(res.status).toBe(401);
    expect(mockMarkOrdersStale).not.toHaveBeenCalled();
  });

  it('proceeds to markOrdersStale when flag is off', async () => {
    vi.stubEnv('DISABLE_ORDERING', 'false');
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockMarkOrdersStale.mockResolvedValueOnce(3);

    const res = await cronRoute.POST(makeReq('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ staled: 3 });
    expect(mockMarkOrdersStale).toHaveBeenCalledOnce();
  });
});
