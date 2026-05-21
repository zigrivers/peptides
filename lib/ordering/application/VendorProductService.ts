import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
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

type ProductRow = {
  id: string;
  vendorId: string;
  compoundId: string;
  name: string;
  priceUsd: Decimal;
  inStock: boolean;
};

function toVendorProduct(row: ProductRow): VendorProduct {
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
  const vendor = await prisma.vendor.findFirst({
    where: { id: input.vendorId, userId: input.userId },
    select: { id: true },
  });
  if (!vendor) throw new Error('vendor_not_found');

  const row = await prisma.vendorProduct.create({
    data: {
      vendorId: input.vendorId,
      compoundId: input.compoundId,
      name: input.name,
      priceUsd: new Decimal(input.priceUsd),
      inStock: input.inStock,
    },
  });
  return toVendorProduct(row as unknown as ProductRow);
}

export async function listVendorProducts(userId: string, vendorId: string): Promise<VendorProduct[]> {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, userId },
    select: { id: true },
  });
  if (!vendor) throw new Error('vendor_not_found');

  const rows = await prisma.vendorProduct.findMany({
    where: { vendorId },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => toVendorProduct(r as unknown as ProductRow));
}

export async function updateVendorProduct(input: UpdateVendorProductInput): Promise<VendorProduct> {
  const existing = await prisma.vendorProduct.findFirst({
    where: { id: input.productId },
    include: { vendor: { select: { userId: true } } },
  });
  if (!existing || (existing as unknown as { vendor: { userId: string } }).vendor.userId !== input.userId) {
    throw new Error('product_not_found');
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.priceUsd !== undefined) data.priceUsd = new Decimal(input.priceUsd);
  if (input.inStock !== undefined) data.inStock = input.inStock;

  const row = await prisma.vendorProduct.update({
    where: { id: input.productId },
    data,
  });
  return toVendorProduct(row as unknown as ProductRow);
}

export async function archiveVendorProduct(userId: string, productId: string): Promise<void> {
  const existing = await prisma.vendorProduct.findFirst({
    where: { id: productId },
    include: { vendor: { select: { userId: true } } },
  });
  if (!existing || (existing as unknown as { vendor: { userId: string } }).vendor.userId !== userId) {
    throw new Error('product_not_found');
  }

  await prisma.vendorProduct.update({
    where: { id: productId },
    data: { inStock: false },
  });
}
