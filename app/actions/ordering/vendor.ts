'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { createVendor, updateVendor, disableVendor } from '@/lib/ordering/application/VendorService';
import { VENDOR_CURRENCIES } from '@/lib/ordering/domain/types';

const CreateVendorSchema = z.object({
  name: z.string().min(1).max(100),
  telegramUsername: z.string().min(1).max(100),
  preferredCurrency: z.enum(VENDOR_CURRENCIES),
  messageTemplate: z.string().max(5000).optional(),
});

const UpdateVendorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  telegramUsername: z.string().min(1).max(100).optional(),
  preferredCurrency: z.enum(VENDOR_CURRENCIES).optional(),
  messageTemplate: z.string().max(5000).optional(),
});

export type VendorActionError =
  | 'unauthorized'
  | 'validation_error'
  | 'not_found'
  | 'system_error';

export type VendorActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: VendorActionError; message?: string };

export async function createVendorAction(
  rawInput: unknown
): Promise<VendorActionResult<{ vendorId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = CreateVendorSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'validation_error', message: parsed.error.message };

  try {
    const vendor = await createVendor({ userId: session.user.id, ...parsed.data });
    revalidatePath('/ordering');
    return { ok: true, data: { vendorId: vendor.id } };
  } catch {
    return { ok: false, error: 'system_error' };
  }
}

export async function updateVendorAction(
  vendorId: string,
  rawInput: unknown
): Promise<VendorActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = UpdateVendorSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'validation_error', message: parsed.error.message };

  try {
    await updateVendor(session.user.id, vendorId, parsed.data);
    revalidatePath('/ordering');
    revalidatePath(`/ordering/${vendorId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'vendor_not_found') {
      return { ok: false, error: 'not_found' };
    }
    return { ok: false, error: 'system_error' };
  }
}

export async function disableVendorAction(vendorId: string): Promise<VendorActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    await disableVendor(session.user.id, vendorId);
    revalidatePath('/ordering');
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'vendor_not_found') {
      return { ok: false, error: 'not_found' };
    }
    return { ok: false, error: 'system_error' };
  }
}
