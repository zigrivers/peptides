import type { Vendor as PrismaVendor } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import type { Vendor } from '@/lib/ordering/domain/types';

export interface CreateVendorInput {
  userId: string;
  name: string;
  telegramUsername: string;
  preferredCurrency: string;
  messageTemplate?: string;
}

function toVendor(row: PrismaVendor): Vendor {
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
  return withAudit(
    async (tx) => {
      const row = await tx.vendor.create({
        data: {
          userId: input.userId,
          name: input.name,
          telegramUsername: input.telegramUsername,
          preferredCurrency: input.preferredCurrency,
          messageTemplate: input.messageTemplate ?? null,
          status: 'ACTIVE',
        },
      });
      return toVendor(row);
    },
    (result) => ({
      actorUserId: input.userId,
      category: 'Order' as const,
      action: 'VENDOR_CREATED' as const,
      resourceId: result.id,
      resourceType: 'Vendor',
    })
  );
}

export async function listVendorsForUser(userId: string): Promise<Vendor[]> {
  const rows = await prisma.vendor.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => toVendor(r));
}

export async function getVendorById(userId: string, vendorId: string): Promise<Vendor | null> {
  const row = await prisma.vendor.findFirst({
    where: { id: vendorId, userId },
  });
  return row ? toVendor(row) : null;
}

export async function updateVendor(
  userId: string,
  vendorId: string,
  patch: Partial<Pick<CreateVendorInput, 'name' | 'telegramUsername' | 'preferredCurrency' | 'messageTemplate'>>
): Promise<Vendor> {
  return withAudit(
    async (tx) => {
      const { count } = await tx.vendor.updateMany({
        where: { id: vendorId, userId },
        data: patch,
      });
      if (count === 0) throw new Error('vendor_not_found');
      const row = await tx.vendor.findFirst({ where: { id: vendorId, userId } });
      if (!row) throw new Error('vendor_not_found');
      return toVendor(row);
    },
    (result) => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'VENDOR_UPDATED' as const,
      resourceId: result.id,
      resourceType: 'Vendor',
      newValues: patch as unknown as JsonValue,
    })
  );
}

export async function disableVendor(userId: string, vendorId: string): Promise<void> {
  await withAudit(
    async (tx) => {
      const { count } = await tx.vendor.updateMany({
        where: { id: vendorId, userId },
        data: { status: 'DISABLED' },
      });
      if (count === 0) throw new Error('vendor_not_found');
    },
    {
      actorUserId: userId,
      category: 'Order' as const,
      action: 'VENDOR_DISABLED' as const,
      resourceId: vendorId,
      resourceType: 'Vendor',
    }
  );
}
