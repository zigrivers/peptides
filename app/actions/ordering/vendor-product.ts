'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  createVendorProduct,
  updateVendorProduct,
  archiveVendorProduct,
} from '@/lib/ordering/application/VendorProductService';
import { assertOrderingEnabled } from '@/lib/shared/featureFlags';

const CreateProductSchema = z.object({
  vendorId: z.string().min(1),
  compoundId: z.string().min(1),
  name: z.string().min(1).max(200),
  priceUsd: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price').refine((v) => parseFloat(v) > 0, 'Price must be greater than zero'),
  inStock: z.boolean().default(true),
});

const UpdateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priceUsd: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price').refine((v) => parseFloat(v) > 0, 'Price must be greater than zero').optional(),
  inStock: z.boolean().optional(),
});

export type ProductActionError =
  | 'unauthorized'
  | 'validation_error'
  | 'vendor_not_found'
  | 'product_not_found'
  | 'system_error';

export type ProductActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: ProductActionError; message?: string };

export async function createVendorProductAction(
  rawInput: unknown
): Promise<ProductActionResult<{ productId: string }>> {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = CreateProductSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'validation_error', message: parsed.error.issues.map((i) => i.message).join(', ') };

  try {
    const product = await createVendorProduct({ userId: session.user.id, ...parsed.data });
    revalidatePath(`/ordering/${parsed.data.vendorId}`);
    return { ok: true, data: { productId: product.id } };
  } catch (err) {
    if (err instanceof Error && err.message === 'vendor_not_found') {
      return { ok: false, error: 'vendor_not_found' };
    }
    return { ok: false, error: 'system_error' };
  }
}

export async function updateVendorProductAction(
  productId: string,
  vendorId: string,
  rawInput: unknown
): Promise<ProductActionResult> {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = UpdateProductSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'validation_error', message: parsed.error.issues.map((i) => i.message).join(', ') };

  try {
    await updateVendorProduct({ userId: session.user.id, productId, ...parsed.data });
    revalidatePath(`/ordering/${vendorId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'product_not_found') {
      return { ok: false, error: 'product_not_found' };
    }
    return { ok: false, error: 'system_error' };
  }
}

export async function archiveVendorProductAction(
  productId: string,
  vendorId: string
): Promise<ProductActionResult> {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    await archiveVendorProduct(session.user.id, productId);
    revalidatePath(`/ordering/${vendorId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'product_not_found') {
      return { ok: false, error: 'product_not_found' };
    }
    return { ok: false, error: 'system_error' };
  }
}
