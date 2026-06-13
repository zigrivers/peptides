import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import type { DoseAmount, Schedule } from '@/lib/tracker/domain/types';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetVendorById: vi.fn(),
  mockListVendorProducts: vi.fn(),
  mockCreateDraftOrder: vi.fn(),
  mockAssertOrderingEnabled: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: () => mocks.mockAuth(),
}));

// Mock vendor services
vi.mock('@/lib/ordering/application/VendorService', () => ({
  getVendorById: (...args: any[]) => mocks.mockGetVendorById(...args),
}));

// Mock vendor product services
vi.mock('@/lib/ordering/application/VendorProductService', () => ({
  listVendorProducts: (...args: any[]) => mocks.mockListVendorProducts(...args),
}));

// Mock order services
vi.mock('@/lib/ordering/application/OrderService', () => ({
  createDraftOrder: (...args: any[]) => mocks.mockCreateDraftOrder(...args),
}));

// Mock feature flags
vi.mock('@/lib/shared/featureFlags', () => ({
  assertOrderingEnabled: () => mocks.mockAssertOrderingEnabled(),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mocks.mockRevalidatePath(...args),
}));

// Mock prisma client for unit tests
const mockFindManyVial = vi.fn();
const mockVendorProductFindFirst = vi.fn();
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    vial: {
      findMany: (...args: any[]) => mockFindManyVial(...args),
    },
    vendorProduct: {
      findFirst: (...args: any[]) => mockVendorProductFindFirst(...args),
    },
  },
}));

import { createDraftOrderAction, getVendorProductsAction } from '@/app/actions/ordering/order';
import { parsePackSize } from '@/app/(dashboard)/ordering/orders/create/_components/OrderBuilderContainer';
import {
  getProtocolFormCategory,
  getVialFormCategory,
  getConcentrationForCompoundForm,
  getProtocolDailyRateMg,
} from '@/app/(dashboard)/ordering/orders/create/forecasting';

describe('ORD-order-builder: Server Actions', () => {
  const userId = 'user-abc';
  const vendorId = '00000000-0000-0000-0000-000000000009';
  const mockVendor = { id: vendorId, userId, name: 'Vendor 1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockAssertOrderingEnabled.mockReturnValue(undefined);
  });

  describe('getVendorProductsAction', () => {
    it('returns unauthorized error if not signed in', async () => {
      mocks.mockAuth.mockResolvedValue(null);
      const res = await getVendorProductsAction(vendorId);
      expect(res).toEqual({
        ok: false,
        error: 'unauthorized',
        message: 'You must be signed in.',
      });
    });

    it('returns vendor_not_found if vendor does not belong to user', async () => {
      mocks.mockGetVendorById.mockResolvedValue(null); // cross-user scoping test
      const res = await getVendorProductsAction(vendorId);
      expect(mocks.mockGetVendorById).toHaveBeenCalledWith(userId, vendorId);
      expect(res).toEqual({
        ok: false,
        error: 'vendor_not_found',
        message: 'Vendor not found.',
      });
    });

    it('successfully returns only active/in-stock products', async () => {
      mocks.mockGetVendorById.mockResolvedValue(mockVendor);
      const mockProducts = [
        { id: 'p1', name: 'Product 1', inStock: true },
        { id: 'p2', name: 'Product 2', inStock: false },
      ];
      mocks.mockListVendorProducts.mockResolvedValue(mockProducts);

      const res = await getVendorProductsAction(vendorId);
      expect(res).toEqual({
        ok: true,
        products: [{ id: 'p1', name: 'Product 1', inStock: true }],
      });
    });
  });

  describe('createDraftOrderAction', () => {
    const validItems = [
      {
        compoundId: '00000000-0000-0000-0000-000000000001',
        form: 'LYOPHILIZED_POWDER' as const,
        vialSizeMg: '5.0',
        quantity: 2,
      },
    ];
    const idempotencyKey = '00000000-0000-0000-0000-000000000002';

    it('returns unauthorized error if not signed in', async () => {
      mocks.mockAuth.mockResolvedValue(null);
      const res = await createDraftOrderAction({ vendorId, items: validItems, idempotencyKey });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('unauthorized');
    });

    it('returns validation error for invalid schemas', async () => {
      const res = await createDraftOrderAction({ vendorId, items: [], idempotencyKey });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('validation_error');
    });

    it('returns vendor_not_found if vendor is not owned by user', async () => {
      mocks.mockGetVendorById.mockResolvedValue(null);
      const res = await createDraftOrderAction({ vendorId, items: validItems, idempotencyKey });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('vendor_not_found');
    });

    it('successfully drafts order and revalidates path cache', async () => {
      mocks.mockGetVendorById.mockResolvedValue(mockVendor);
      mocks.mockCreateDraftOrder.mockResolvedValue({ orderId: 'order-123' });

      const res = await createDraftOrderAction({ vendorId, items: validItems, idempotencyKey });
      expect(mocks.mockCreateDraftOrder).toHaveBeenCalledWith(
        userId,
        vendorId,
        validItems,
        idempotencyKey
      );
      expect(mocks.mockRevalidatePath).toHaveBeenCalledWith('/ordering/orders', 'layout');
      expect(res).toEqual({ ok: true, orderId: 'order-123' });
    });

    it('returns validation error if product is not found or not in stock', async () => {
      mocks.mockGetVendorById.mockResolvedValue(mockVendor);
      mockVendorProductFindFirst.mockResolvedValue(null);

      const itemsWithProd = [
        {
          compoundId: '00000000-0000-0000-0000-000000000001',
          form: 'LYOPHILIZED_POWDER' as const,
          vialSizeMg: '5.0',
          quantity: 2,
          productId: '00000000-0000-0000-0000-000000000099',
        },
      ];

      const res = await createDraftOrderAction({ vendorId, items: itemsWithProd, idempotencyKey });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('validation_error');
    });

    it('successfully drafts order using server-side product values (price/currency/details)', async () => {
      mocks.mockGetVendorById.mockResolvedValue(mockVendor);
      mockVendorProductFindFirst.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000099',
        compoundId: '00000000-0000-0000-0000-000000000001',
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: new Decimal('10.0'),
        priceUsd: new Decimal('45.00'),
        inStock: true,
      });
      mocks.mockCreateDraftOrder.mockResolvedValue({ orderId: 'order-123' });

      const itemsWithProd = [
        {
          compoundId: '00000000-0000-0000-0000-000000000001',
          form: 'LYOPHILIZED_POWDER' as const,
          vialSizeMg: '5.0', // Tampered client value
          quantity: 2,
          productId: '00000000-0000-0000-0000-000000000099',
          unitPrice: '10.00', // Tampered client pricing
          unitCurrency: 'EUR', // Tampered client currency
        },
      ];

      const res = await createDraftOrderAction({ vendorId, items: itemsWithProd, idempotencyKey });
      expect(res.ok).toBe(true);
      expect(mocks.mockCreateDraftOrder).toHaveBeenCalledWith(
        userId,
        vendorId,
        [
          expect.objectContaining({
            compoundId: '00000000-0000-0000-0000-000000000001',
            form: 'LYOPHILIZED_POWDER',
            vialSizeMg: '10', // Overridden server value
            quantity: 2,
            productId: '00000000-0000-0000-0000-000000000099',
            unitPrice: '45', // Overridden server pricing
            unitCurrency: 'USD', // Overridden server currency
          }),
        ],
        idempotencyKey
      );
    });
  });
});

describe('ORD-order-builder: Form Category Mappings', () => {
  it('maps subcutaneous and intramuscular routes to Injectable form category', () => {
    expect(getProtocolFormCategory('SUBCUTANEOUS')).toBe('Injectable');
    expect(getProtocolFormCategory('intramuscular')).toBe('Injectable');
    expect(getProtocolFormCategory('ORAL')).toBe('Non-Injectable');
    expect(getProtocolFormCategory('Nasal')).toBe('Non-Injectable');
  });

  it('maps reconstituted vials or lyophilized orders to Injectable category', () => {
    expect(
      getVialFormCategory({ bacWaterMl: new Decimal('1.5'), orderItem: null })
    ).toBe('Injectable');
    expect(
      getVialFormCategory({
        bacWaterMl: null,
        orderItem: { form: 'LYOPHILIZED_POWDER' },
      })
    ).toBe('Injectable');
    expect(
      getVialFormCategory({ bacWaterMl: null, orderItem: { form: 'SOLUTION' } })
    ).toBe('Non-Injectable');
    expect(getVialFormCategory({ bacWaterMl: null, orderItem: null })).toBe('Non-Injectable');
  });
});

describe('ORD-order-builder: parsePackSize', () => {
  it('extracts pack sizes correctly from item names', () => {
    expect(parsePackSize('10x BPC-157 5mg')).toBe(10);
    expect(parsePackSize('BPC-157 5mg 10-pack')).toBe(10);
    expect(parsePackSize('BPC-157 pack of 5 vials')).toBe(5);
    expect(parsePackSize('BPC-157 5mg')).toBe(1); // fallback
  });
});

describe('ORD-order-builder: Depletion Rate Calculations', () => {
  const userId = 'user-abc';
  const compoundId = 'compound-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates daily protocol rates for Daily schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '2.5', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'Daily' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('2.50');
  });

  it('calculates daily protocol rates for EOD schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '2.5', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'EOD' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('1.25'); // 2.5 / 2
  });

  it('calculates daily protocol rates for SpecificDaysOfWeek schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '3.5', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'SpecificDaysOfWeek' as const, daysOfWeek: ['Mon', 'Thu'] } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('1.00'); // 3.5 * 2 / 7
  });

  it('calculates daily protocol rates for TwiceDaily schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '1.5/1.5', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'TwiceDaily' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('3.00'); // (1.5 + 1.5) * 1
  });

  it('calculates daily protocol rates for TwiceSpecificDaysOfWeek schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '1.75/1.75', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'TwiceSpecificDaysOfWeek' as const, daysOfWeek: ['Mon', 'Thu'] } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('1.00'); // (1.75 + 1.75) * 2 / 7 = 3.5 * 2 / 7 = 1.00
  });

  it('calculates daily protocol rates for CustomInterval schedule', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '5.0', unit: 'mg' as const } as DoseAmount,
      schedule: { frequency: 'CustomInterval' as const, intervalDays: 5 } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('1.00'); // 5 / 5
  });

  it('converts mcg units to mg correctly', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '500', unit: 'mcg' as const } as DoseAmount,
      schedule: { frequency: 'Daily' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    const { rateMg } = await getProtocolDailyRateMg(userId, protocol, 'U100');
    expect(rateMg.toFixed(2)).toBe('0.50'); // 500 / 1000
  });

  it('performs volume/IU conversions using newest vial concentration with syringe preference support', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '10', unit: 'IU' as const } as DoseAmount,
      schedule: { frequency: 'Daily' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    // Mock active reconstituted vial with totalMg = 5, bacWaterMl = 2 => concentration = 2.5 mg/mL
    const mockVials = [
      {
        id: 'v1',
        totalMg: new Decimal('5.0'),
        bacWaterMl: new Decimal('2.0'),
        remainingMg: new Decimal('4.0'),
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date('2026-05-10'),
      },
    ];
    mockFindManyVial.mockResolvedValue(mockVials);

    // Test with U-100 syringe (multiplier = 0.01)
    const resU100 = await getProtocolDailyRateMg(userId, protocol, 'U100');
    // doseMg = 10 * 0.01 * 2.5 = 0.25 mg
    expect(resU100.rateMg.toFixed(2)).toBe('0.25');

    // Test with U-40 syringe (multiplier = 0.025)
    const resU40 = await getProtocolDailyRateMg(userId, protocol, 'U40');
    // doseMg = 10 * 0.025 * 2.5 = 0.625 mg
    expect(resU40.rateMg.toFixed(3)).toBe('0.625');
  });

  it('falls back to historical concentration or default 2.0 mg/mL if no active reconstituted vial exists', async () => {
    const protocol = {
      compoundId,
      dose: { amount: '0.1', unit: 'mL' as const } as DoseAmount,
      schedule: { frequency: 'Daily' as const } as Schedule,
      administrationRoute: 'SUBCUTANEOUS',
    };
    mockFindManyVial.mockResolvedValue([]); // No active vials

    // Test default fallback (concentration = 2.0 mg/mL)
    const resDefault = await getProtocolDailyRateMg(userId, protocol, 'U100');
    // doseMg = 0.1 * 2.0 = 0.2 mg
    expect(resDefault.rateMg.toFixed(2)).toBe('0.20');
    expect(resDefault.isDefaultConcentration).toBe(true);
  });
});

describe('ORD-order-builder: getCompoundNameForProduct', () => {
  const compoundsList = [
    { id: 'cmp-bpc', name: 'BPC-157' },
    { id: 'cmp-tb', name: 'TB-500' },
    { id: 'cmp-sema', name: 'Semaglutide' },
    { id: 'cmp-tirz', name: 'Tirzepatide' },
  ];

  it('performs direct match by compoundId', async () => {
    const { getCompoundNameForProduct } = await import('@/app/(dashboard)/ordering/orders/create/_components/OrderBuilderContainer');
    const product = {
      id: 'p-1',
      vendorId: 'v-1',
      compoundId: 'cmp-sema',
      name: 'Custom Sema Product',
      priceUsd: '50.00',
      inStock: true,
    };
    expect(getCompoundNameForProduct(product, compoundsList)).toBe('Semaglutide');
  });

  it('performs robust substring match ignoring case and spaces/dashes', async () => {
    const { getCompoundNameForProduct } = await import('@/app/(dashboard)/ordering/orders/create/_components/OrderBuilderContainer');
    const product = {
      id: 'p-2',
      vendorId: 'v-1',
      compoundId: 'other-id',
      name: '10x BPC-157 10mg Pack',
      priceUsd: '80.00',
      inStock: true,
    };
    expect(getCompoundNameForProduct(product, compoundsList)).toBe('BPC-157');
  });

  it('falls back to token parsing when substring match fails, filtering noise', async () => {
    const { getCompoundNameForProduct } = await import('@/app/(dashboard)/ordering/orders/create/_components/OrderBuilderContainer');
    const product = {
      id: 'p-3',
      vendorId: 'v-1',
      compoundId: 'other-id',
      name: '10x Twin-pack Tesamorelin 10mg',
      priceUsd: '90.00',
      inStock: true,
    };
    expect(getCompoundNameForProduct(product, compoundsList)).toBe('Tesamorelin');
  });

  it('falls back to first token or default if all else fails', async () => {
    const { getCompoundNameForProduct } = await import('@/app/(dashboard)/ordering/orders/create/_components/OrderBuilderContainer');
    const product = {
      id: 'p-4',
      vendorId: 'v-1',
      compoundId: 'other-id',
      name: '10x 10mg Standard Kit',
      priceUsd: '95.00',
      inStock: true,
    };
    expect(getCompoundNameForProduct(product, compoundsList)).toBe('Standard');
  });
});

