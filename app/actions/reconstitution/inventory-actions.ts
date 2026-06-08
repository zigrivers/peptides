'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Decimal } from 'decimal.js';
import {
  saveDryVials,
  reconstituteVial,
  deleteVial,
  saveVial,
  updateVialRemainingMg,
} from '@/lib/reconstitution/application/VialService';

const SupportedInventoryCurrencySchema = z.enum(['USD', 'USDT', 'EUR', 'GBP']);

const AddDryVialsSchema = z.object({
  compoundId: z.string().uuid(),
  totalMg: z.string().refine((val) => {
    try {
      const d = new Decimal(val);
      return d.gt(0);
    } catch {
      return false;
    }
  }, 'Must be a positive decimal'),
  quantity: z.number().int().positive().max(100),
  cost: z.string().optional().refine((val) => {
    if (!val) return true;
    try {
      const d = new Decimal(val);
      return d.gte(0);
    } catch {
      return false;
    }
  }, 'Must be a non-negative decimal'),
  currency: SupportedInventoryCurrencySchema.optional(),
  expiresAt: z.string().optional().refine((val) => {
    if (!val) return true;
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid date format'),
});

const ReconstituteVialSchema = z.object({
  vialId: z.string().uuid(),
  bacWaterMl: z.string().refine((val) => {
    try {
      const d = new Decimal(val);
      return d.gt(0);
    } catch {
      return false;
    }
  }, 'Must be a positive decimal'),
  expiresAt: z.string().optional().refine((val) => {
    if (!val) return true;
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid date format'),
});

const AddReconstitutedVialSchema = z.object({
  compoundId: z.string().uuid(),
  totalMg: z.string().refine((val) => {
    try {
      const d = new Decimal(val);
      return d.gt(0);
    } catch {
      return false;
    }
  }, 'Must be a positive decimal'),
  bacWaterMl: z.string().refine((val) => {
    try {
      const d = new Decimal(val);
      return d.gt(0);
    } catch {
      return false;
    }
  }, 'Must be a positive decimal'),
  cost: z.string().optional().refine((val) => {
    if (!val) return true;
    try {
      const d = new Decimal(val);
      return d.gte(0);
    } catch {
      return false;
    }
  }, 'Must be a non-negative decimal'),
  currency: SupportedInventoryCurrencySchema.optional(),
  expiresAt: z.string().optional().refine((val) => {
    if (!val) return true;
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid date format'),
});

export type InventoryResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'validation_error' | 'not_found' | 'system_error'; message?: string };

export async function addDryVialsAction(rawInput: unknown): Promise<InventoryResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = AddDryVialsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.issues[0]?.message };
  }

  try {
    await saveDryVials({
      userId: session.user.id,
      compoundId: parsed.data.compoundId,
      totalMg: new Decimal(parsed.data.totalMg),
      quantity: parsed.data.quantity,
      cost: parsed.data.cost ? new Decimal(parsed.data.cost) : undefined,
      currency: parsed.data.currency || undefined,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    revalidatePath('/reconstitution');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    console.error('[addDryVialsAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

export async function reconstituteDryVialAction(rawInput: unknown): Promise<InventoryResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = ReconstituteVialSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.issues[0]?.message };
  }

  try {
    await reconstituteVial({
      userId: session.user.id,
      vialId: parsed.data.vialId,
      bacWaterMl: new Decimal(parsed.data.bacWaterMl),
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    revalidatePath('/reconstitution');
    revalidatePath('/dashboard');
    revalidatePath('/tracker');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    console.error('[reconstituteDryVialAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

export async function deleteVialAction(vialId: string): Promise<InventoryResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = z.string().uuid().safeParse(vialId);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: 'Invalid Vial ID format' };
  }

  try {
    await deleteVial(session.user.id, parsed.data);
    revalidatePath('/reconstitution');
    revalidatePath('/dashboard');
    revalidatePath('/tracker');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    console.error('[deleteVialAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

export async function addReconstitutedVialAction(rawInput: unknown): Promise<InventoryResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = AddReconstitutedVialSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.issues[0]?.message };
  }

  try {
    await saveVial({
      userId: session.user.id,
      compoundId: parsed.data.compoundId,
      totalMg: new Decimal(parsed.data.totalMg),
      bacWaterMl: new Decimal(parsed.data.bacWaterMl),
      cost: parsed.data.cost ? new Decimal(parsed.data.cost) : undefined,
      currency: parsed.data.currency || undefined,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    revalidatePath('/reconstitution');
    revalidatePath('/dashboard');
    revalidatePath('/tracker');
    return { ok: true };
  } catch (err) {
    console.error('[addReconstitutedVialAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

const UpdateVialRemainingMgSchema = z.object({
  vialId: z.string().uuid(),
  remainingMg: z.string().refine((val) => {
    try {
      const d = new Decimal(val);
      return d.gte(0);
    } catch {
      return false;
    }
  }, 'Must be a non-negative decimal'),
});

export async function updateVialRemainingMgAction(rawInput: unknown): Promise<InventoryResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = UpdateVialRemainingMgSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.issues[0]?.message };
  }

  try {
    await updateVialRemainingMg({
      userId: session.user.id,
      vialId: parsed.data.vialId,
      remainingMg: new Decimal(parsed.data.remainingMg),
    });

    revalidatePath('/reconstitution');
    revalidatePath('/dashboard');
    revalidatePath('/tracker');
    revalidatePath('/reference');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    console.error('[updateVialRemainingMgAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}
