'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { createDraftOrder } from '@/lib/ordering/application/OrderService';
import { listVendorProducts } from '@/lib/ordering/application/VendorProductService';
import { getVendorById } from '@/lib/ordering/application/VendorService';
import { assertOrderingEnabled } from '@/lib/shared/featureFlags';

const OrderLineItemInputSchema = z.object({
  compoundId: z.string().uuid(),
  compoundName: z.string().optional(),
  form: z.enum(['LYOPHILIZED_POWDER', 'SOLUTION']),
  vialSizeMg: z.string().refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return d.isFinite() && d.gt(0) && d.decimalPlaces() <= 3;
      } catch {
        return false;
      }
    },
    { message: 'vialSizeMg must be a positive decimal with max 3 decimal places' }
  ),
  quantity: z.number().int().positive(),
  productId: z.string().uuid().optional().nullable(),
  unitPrice: z.string().optional().nullable(),
  unitCurrency: z.string().optional().nullable(),
});

const CreateDraftOrderSchema = z.object({
  vendorId: z.string().uuid(),
  items: z.array(OrderLineItemInputSchema).nonempty('Order must contain at least one item.'),
  idempotencyKey: z.string().uuid(),
});

export async function createDraftOrderAction(rawInput: unknown) {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const result = CreateDraftOrderSchema.safeParse(rawInput);
  if (!result.success) {
    return { ok: false, error: 'validation_error', message: result.error.errors[0].message };
  }

  const { vendorId, items, idempotencyKey } = result.data;

  // Scoping check: verify the vendor belongs to the user
  const vendor = await getVendorById(session.user.id, vendorId);
  if (!vendor) {
    return { ok: false, error: 'vendor_not_found', message: 'Vendor not found.' };
  }

  try {
    const validatedItems = [];
    for (const item of items) {
      if (item.productId) {
        const dbProduct = await prisma.vendorProduct.findFirst({
          where: {
            id: item.productId,
            vendorId,
            vendor: { userId: session.user.id },
            inStock: true,
          },
        });
        if (!dbProduct) {
          return {
            ok: false,
            error: 'validation_error',
            message: `Product ${item.productId} is not available for this vendor.`,
          };
        }
        validatedItems.push({
          compoundId: dbProduct.compoundId,
          form: (dbProduct.form ?? item.form) as 'LYOPHILIZED_POWDER' | 'SOLUTION',
          vialSizeMg: dbProduct.vialSizeMg ? dbProduct.vialSizeMg.toString() : item.vialSizeMg,
          quantity: item.quantity,
          productId: item.productId,
          unitPrice: dbProduct.priceUsd.toString(),
          unitCurrency: 'USD',
        });
      } else {
        validatedItems.push({
          compoundId: item.compoundId,
          form: item.form,
          vialSizeMg: item.vialSizeMg,
          quantity: item.quantity,
          productId: undefined,
          unitPrice: item.unitPrice ?? undefined,
          unitCurrency: item.unitCurrency ?? undefined,
        });
      }
    }

    const draftResult = await createDraftOrder(
      session.user.id,
      vendorId,
      validatedItems,
      idempotencyKey as `${string}-${string}-${string}-${string}-${string}`
    );
    revalidatePath('/ordering/orders', 'layout');
    return { ok: true, orderId: draftResult.orderId };
  } catch (err) {
    console.error('[createDraftOrderAction] error:', err);
    return {
      ok: false,
      error: 'system_error',
      message: err instanceof Error ? err.message : 'Something went wrong.',
    };
  }
}

export async function getVendorProductsAction(vendorId: string) {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  if (!vendorId || typeof vendorId !== 'string') {
    return { ok: false, error: 'validation_error', message: 'Invalid vendor selection.' };
  }

  // Scoping check: verify the vendor belongs to the user
  const vendor = await getVendorById(session.user.id, vendorId);
  if (!vendor) {
    return { ok: false, error: 'vendor_not_found', message: 'Vendor not found.' };
  }

  try {
    const products = await listVendorProducts(session.user.id, vendorId);
    // Filters products to only return active/in-stock products to minimize payload size (F-005)
    const activeProducts = products.filter((p) => p.inStock);
    return { ok: true, products: activeProducts };
  } catch (err) {
    console.error('[getVendorProductsAction] error:', err);
    return {
      ok: false,
      error: 'system_error',
      message: err instanceof Error ? err.message : 'Something went wrong.',
    };
  }
}
