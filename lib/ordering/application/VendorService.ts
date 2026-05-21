import { prisma } from '@/lib/shared/prisma';
import type { Vendor } from '@/lib/ordering/domain/types';

export interface CreateVendorInput {
  userId: string;
  name: string;
  telegramUsername: string;
  preferredCurrency: string;
  messageTemplate?: string;
}

type VendorRow = {
  id: string;
  userId: string;
  name: string;
  telegramUsername: string;
  messageTemplate: string | null;
  preferredCurrency: string;
  status: string;
  createdAt: Date;
};

function toVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    telegramUsername: row.telegramUsername,
    messageTemplate: row.messageTemplate,
    preferredCurrency: row.preferredCurrency,
    status: row.status as Vendor['status'],
    createdAt: row.createdAt,
  };
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const row = await prisma.vendor.create({
    data: {
      userId: input.userId,
      name: input.name,
      telegramUsername: input.telegramUsername,
      preferredCurrency: input.preferredCurrency,
      messageTemplate: input.messageTemplate ?? null,
      status: 'ACTIVE',
    },
  });
  return toVendor(row as VendorRow);
}

export async function listVendorsForUser(userId: string): Promise<Vendor[]> {
  const rows = await prisma.vendor.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => toVendor(r as VendorRow));
}

export async function getVendorById(userId: string, vendorId: string): Promise<Vendor | null> {
  const row = await prisma.vendor.findFirst({
    where: { id: vendorId, userId },
  });
  return row ? toVendor(row as VendorRow) : null;
}

export async function updateVendor(
  userId: string,
  vendorId: string,
  patch: Partial<Pick<CreateVendorInput, 'name' | 'telegramUsername' | 'preferredCurrency' | 'messageTemplate'>>
): Promise<Vendor> {
  const existing = await prisma.vendor.findFirst({ where: { id: vendorId, userId } });
  if (!existing) throw new Error('vendor_not_found');

  const row = await prisma.vendor.update({
    where: { id: vendorId },
    data: patch,
  });
  return toVendor(row as VendorRow);
}

export async function disableVendor(userId: string, vendorId: string): Promise<void> {
  const existing = await prisma.vendor.findFirst({ where: { id: vendorId, userId } });
  if (!existing) throw new Error('vendor_not_found');

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { status: 'DISABLED' },
  });
}

