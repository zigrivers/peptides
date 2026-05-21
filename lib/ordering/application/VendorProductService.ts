import Decimal from 'decimal.js';
import type { VendorProduct as PrismaVendorProduct } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { VendorProduct } from '@/lib/ordering/domain/types';

export interface CreateVendorProductInput {
  userId: string;
  vendorId: string;
  compoundId: string;
  name: string;
  priceUsd: string;
  inStock: boolean;
}

export interface UpdateVendorProductInput {
  userId: string;
  productId: string;
  name?: string;
  priceUsd?: string;
  inStock?: boolean;
}

function toVendorProduct(row: PrismaVendorProduct): VendorProduct {
  return {
    id: row.id,
    vendorId: row.vendorId,
    compoundId: row.compoundId,
    name: row.name,
    priceUsd: new Decimal(row.priceUsd).toFixed(2),
    inStock: row.inStock,
  };
}

export async function createVendorProduct(input: CreateVendorProductInput): Promise<VendorProduct> {
  return withAudit(
    async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: input.vendorId, userId: input.userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!vendor) throw new Error('vendor_not_found');

      const row = await tx.vendorProduct.create({
        data: {
          vendorId: input.vendorId,
          compoundId: input.compoundId,
          name: input.name,
          priceUsd: new Decimal(input.priceUsd),
          inStock: input.inStock,
        },
      });
      return toVendorProduct(row);
    },
    (result) => ({
      actorUserId: input.userId,
      category: 'Order' as const,
      action: 'VENDOR_PRODUCT_ADDED' as const,
      resourceId: result.id,
      resourceType: 'VendorProduct',
      newValues: { vendorId: input.vendorId, name: input.name } as { vendorId: string; name: string },
    })
  );
}

export async function listVendorProducts(userId: string, vendorId: string): Promise<VendorProduct[]> {
  const rows = await prisma.vendorProduct.findMany({
    where: { vendorId, vendor: { userId } },
    orderBy: [{ inStock: 'desc' }, { name: 'asc' }],
  });
  return rows.map((r) => toVendorProduct(r));
}

export async function updateVendorProduct(input: UpdateVendorProductInput): Promise<VendorProduct> {
  return withAudit(
    async (tx) => {
      // Verify ownership inside the same transaction (eliminates TOCTOU); update by verified ID
      const existing = await tx.vendorProduct.findFirst({
        where: { id: input.productId, vendor: { userId: input.userId } },
      });
      if (!existing) throw new Error('product_not_found');

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.priceUsd !== undefined) data.priceUsd = new Decimal(input.priceUsd);
      if (input.inStock !== undefined) data.inStock = input.inStock;

      const row = await tx.vendorProduct.update({ where: { id: existing.id }, data });
      return toVendorProduct(row);
    },
    (result) => ({
      actorUserId: input.userId,
      category: 'Order' as const,
      action: 'VENDOR_PRODUCT_UPDATED' as const,
      resourceId: result.id,
      resourceType: 'VendorProduct',
    })
  );
}

export async function archiveVendorProduct(userId: string, productId: string): Promise<void> {
  await withAudit(
    async (tx) => {
      // Verify ownership inside the same transaction (eliminates TOCTOU); update by verified ID
      const existing = await tx.vendorProduct.findFirst({
        where: { id: productId, vendor: { userId } },
      });
      if (!existing) throw new Error('product_not_found');
      await tx.vendorProduct.update({ where: { id: existing.id }, data: { inStock: false } });
    },
    {
      actorUserId: userId,
      category: 'Order' as const,
      action: 'VENDOR_PRODUCT_ARCHIVED' as const,
      resourceId: productId,
      resourceType: 'VendorProduct',
    }
  );
}
