import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { ITEM_FORMS } from '@/lib/ordering/domain/types';
import type { OrderLineItemInput, SendMethod } from '@/lib/ordering/domain/types';
import { sendTelegramMessage } from '@/lib/ordering/infrastructure/MTProtoClient';
import { getDecryptedSession, buildFallbackDeepLink } from './TelegramAuthService';
import { findCompoundsByIds } from '@/lib/reference/infrastructure/CompoundRepo';

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    vendor: true;
    items: { include: { compound: { select: { name: true } } } };
  };
}>;

export interface CreateDraftOrderResult {
  orderId: string;
}

export interface SendOrderResult {
  sendMethod: SendMethod;
  telegramMessageId?: string;
  fallbackText?: string;
  fallbackDeepLink?: string;
}

function normalizeVialSize(vialSizeMg: string): string {
  let d: Decimal;
  try {
    d = new Decimal(vialSizeMg);
  } catch {
    throw new Error(`invalid_vial_size: ${vialSizeMg}`);
  }
  if (!d.isFinite() || d.lte(0)) throw new Error(`invalid_vial_size: ${vialSizeMg}`);
  // Reject precision beyond DECIMAL(10,3) — prevents values like 5.0001 from silently
  // rounding to 5.000 in the DB while appearing distinct in merge keys.
  if (d.decimalPlaces() > 3) throw new Error(`invalid_vial_size: ${vialSizeMg}`);
  return d.toFixed(3);  // canonical form matching DB DECIMAL(10,3) column precision
}

function mergeItems(items: OrderLineItemInput[]): OrderLineItemInput[] {
  const map = new Map<string, OrderLineItemInput>();
  for (const item of items) {
    // Key matches the DB unique constraint @@unique([orderId, compoundId, form, vialSizeMg])
    // so merge is always collision-free at createMany time.
    const normalizedSize = normalizeVialSize(item.vialSizeMg);
    const key = `${item.compoundId}:${item.form}:${normalizedSize}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      // Promote productId metadata if current item has one and existing doesn't — prevents
      // productId from being silently dropped when items arrive in non-productId-first order,
      // which would bypass catalog price validation. Conflicting productIds are rejected.
      if (item.productId != null) {
        if (existing.productId != null && existing.productId !== item.productId) throw new Error('product_id_conflict');
        if (existing.productId == null) {
          existing.productId = item.productId;
          existing.unitPrice = item.unitPrice;
          existing.unitCurrency = item.unitCurrency;
        }
      }
    } else {
      map.set(key, { ...item, vialSizeMg: normalizedSize });
    }
  }
  return Array.from(map.values());
}

function composeMessage(
  vendor: { name: string; preferredCurrency: string; messageTemplate: string | null },
  items: Array<{ compoundName: string; form: string; vialSizeMg: { toString(): string }; quantity: number }>
): string {
  const itemLines = items
    .map(
      (i) =>
        // 'mg' is intentional — the vialSizeMg field name defines the unit; all vial sizes are in milligrams.
        `- ${i.quantity}x ${i.compoundName} ${i.vialSizeMg.toString()}mg (${i.form === 'LYOPHILIZED_POWDER' ? 'lyophilized' : 'solution'})`
    )
    .join('\n');

  if (vendor.messageTemplate?.trim()) {
    // Use .replace with /g flag for Node <15 compatibility (replaceAll is Node 15+)
    return vendor.messageTemplate.includes('{ITEMS}')
      ? vendor.messageTemplate.replace(/{ITEMS}/g, () => itemLines)
      : `${vendor.messageTemplate}\n\n${itemLines}`;
  }

  return `Hi ${vendor.name}, I'd like to order:\n${itemLines}\nPreferred currency: ${vendor.preferredCurrency}`;
}

export async function createDraftOrder(
  userId: string,
  vendorId: string,
  items: OrderLineItemInput[],
  idempotencyKey = randomUUID()
): Promise<CreateDraftOrderResult> {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId, status: 'ACTIVE' } });
  if (!vendor) throw new Error('vendor_not_found');

  const existing = await prisma.order.findFirst({ where: { userId, vendorId, idempotencyKey } });
  if (existing) return { orderId: existing.id };

  if (items.some((i) => !(ITEM_FORMS as readonly string[]).includes(i.form))) throw new Error('invalid_form');
  if (items.some((i) => i.quantity <= 0 || !Number.isInteger(i.quantity))) throw new Error('invalid_quantity');
  const merged = mergeItems(items);
  if (merged.length === 0) throw new Error('order_items_required');

  const uniqueCompoundIds = [...new Set(merged.map((i) => i.compoundId))];
  const foundCompounds = await findCompoundsByIds(uniqueCompoundIds);
  if (Object.keys(foundCompounds).length !== uniqueCompoundIds.length) throw new Error('compound_not_found');

  try {
    const order = await withAudit(
      async (tx) => {
        const newOrder = await tx.order.create({
          data: { userId, vendorId, idempotencyKey, status: 'DRAFT' },
        });
        // Build a catalog map for product-backed items; validates ownership, inStock, and
        // compound consistency. Pricing is populated server-side from the catalog to prevent
        // stale or tampered client input.
        const itemsWithProduct = merged.filter((i) => i.productId != null);
        const productMap = new Map<string, { compoundId: string; priceUsd: { toString(): string }; form: string | null; vialSizeMg: { toString(): string } | null }>();
        if (itemsWithProduct.length > 0) {
          const products = await tx.vendorProduct.findMany({
            where: { id: { in: [...new Set(itemsWithProduct.map((i) => i.productId!))] }, vendorId, vendor: { userId }, inStock: true },
            select: { id: true, compoundId: true, priceUsd: true, form: true, vialSizeMg: true },
          });
          for (const p of products) productMap.set(p.id, p);
          for (const item of itemsWithProduct) {
            const product = productMap.get(item.productId!);
            if (!product) throw new Error('product_not_found');
            if (product.compoundId !== item.compoundId) throw new Error('product_compound_mismatch');
            if (product.form && product.form !== item.form) throw new Error('product_form_mismatch');
            if (product.vialSizeMg != null && normalizeVialSize(product.vialSizeMg.toString()) !== item.vialSizeMg) throw new Error('product_vial_size_mismatch');
          }
        }
        await tx.orderItem.createMany({
          data: merged.map((item) => {
            const product = item.productId ? productMap.get(item.productId) : undefined;
            return {
              orderId: newOrder.id,
              compoundId: item.compoundId,
              form: item.form,
              vialSizeMg: item.vialSizeMg,
              quantity: item.quantity,
              productId: item.productId ?? null,
              // Catalog price/currency take precedence over caller-supplied values for
              // product-backed items to prevent tampered pricing. priceUsd is always USD.
              unitPrice: product ? product.priceUsd.toString() : (item.unitPrice ?? null),
              unitCurrency: product ? 'USD' : (item.unitCurrency ?? null),
            };
          }),
        });
        return newOrder;
      },
      (result) => ({
        actorUserId: userId,
        category: 'Order' as const,
        action: 'ORDER_DRAFTED' as const,
        resourceId: result.id,
        resourceType: 'Order',
      })
    );

    return { orderId: order.id };
  } catch (err) {
    // If two concurrent requests race on the same idempotencyKey (which has a @unique
    // constraint), one will succeed and the other will get a P2002 unique-key violation.
    // Re-read the winner and return it rather than surfacing an internal error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.order.findFirst({ where: { userId, vendorId, idempotencyKey } });
      if (winner) return { orderId: winner.id };
    }
    throw err;
  }
}

export async function sendOrder(
  userId: string,
  orderId: string,
  force = false
): Promise<SendOrderResult> {
  const order: OrderWithDetails | null = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      vendor: true,
      items: { include: { compound: { select: { name: true } } } },
    },
  });
  if (!order) throw new Error('order_not_found');
  if (order.status !== 'DRAFT') throw new Error('invalid_order_transition');
  if (order.vendor.status !== 'ACTIVE') throw new Error('vendor_disabled');
  if (!order.vendor.telegramUsername) throw new Error('vendor_missing_telegram_username');

  const itemsForMessage = order.items.map((i) => ({
    compoundName: i.compound?.name ?? i.compoundId,
    form: i.form,
    vialSizeMg: i.vialSizeMg,
    quantity: i.quantity,
  }));

  const messageText = composeMessage(order.vendor, itemsForMessage);

  const cutoff = new Date(Date.now() - 60_000);

  // Dual-write gap recovery: if telegramMessageId is already set on this DRAFT order,
  // a prior Telegram send succeeded but the DB finalize failed. Skip re-sending and
  // go directly to finalize using the recorded messageId.
  let sendMethod: SendMethod = 'MANUAL_FALLBACK';
  let telegramMessageId: string | undefined = order.telegramMessageId ?? undefined;

  if (telegramMessageId) {
    sendMethod = 'AUTOMATED';
    console.info('[OrderService] Dual-write gap recovery — skipping Telegram re-send', { orderId, messageId: telegramMessageId });
  } else {
    // Normal path: duplicate check + reservation in a single atomic transaction.
    // Running both inside withAudit narrows the race window vs. a separate pre-check.
    // Note: READ COMMITTED isolation means two concurrent transactions can still both
    // observe "no duplicate" before either commits. Advisory locks would fully close
    // this gap; this design accepts that residual risk for simplicity.
    type CheckAndReserveResult = { blocked: true; duplicateOrderId: string } | { blocked: false };

    const sentAt = new Date();
    const checkAndReserve = await withAudit<CheckAndReserveResult>(
      async (tx) => {
        if (!force) {
          const dup = await tx.order.findFirst({
            where: { userId, vendorId: order.vendorId, messageText, sentAt: { gte: cutoff }, id: { not: orderId } },
          });
          if (dup) return { blocked: true, duplicateOrderId: dup.id };
        }
        const { count } = await tx.order.updateMany({
          where: {
            id: orderId,
            userId,
            status: 'DRAFT',
            ...(force ? {} : { OR: [{ sentAt: null }, { sentAt: { lt: cutoff } }] }),
          },
          data: { messageText, sentAt },
        });
        if (count === 0) throw new Error('order_not_found_or_not_draft');
        return { blocked: false };
      },
      (result) => {
        if (result.blocked) {
          return {
            actorUserId: userId,
            category: 'Order' as const,
            action: 'DUPLICATE_SEND_BLOCKED' as const,
            resourceId: orderId,
            resourceType: 'Order',
            metadata: { duplicateOrderId: result.duplicateOrderId },
          };
        }
        return {
          actorUserId: userId,
          category: 'Order' as const,
          action: 'ORDER_SEND_ATTEMPTED' as const,
          resourceId: orderId,
          resourceType: 'Order',
        };
      }
    );

    if (checkAndReserve.blocked) throw new Error('possible_duplicate_send');

    try {
      const sessionString = await getDecryptedSession(userId);
      if (sessionString) {
        const result = await sendTelegramMessage(sessionString, order.vendor.telegramUsername, messageText);
        telegramMessageId = result.messageId;
        // Write telegramMessageId before the status finalize so that if finalize fails,
        // the next retry detects it and skips re-sending (dual-write gap mitigation).
        await prisma.order.updateMany({
          where: { id: orderId, userId, status: 'DRAFT' },
          data: { telegramMessageId },
        });
        sendMethod = 'AUTOMATED';
        console.info('[OrderService] Telegram send succeeded', { orderId, messageId: telegramMessageId });
      }
    } catch (err) {
      console.error('[OrderService] Telegram send failed, falling back to manual:', err);
    }
  }

  if (sendMethod === 'AUTOMATED') {
    // Telegram delivered the message — transition the order to SENT.
    await withAudit(
      async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, userId, status: 'DRAFT' },
          data: { status: 'SENT', sendMethod, telegramMessageId: telegramMessageId! },
        });
        if (count === 0) throw new Error('invalid_order_transition');
      },
      () => ({
        actorUserId: userId,
        category: 'Order' as const,
        action: 'ORDER_SENT' as const,
        resourceId: orderId,
        resourceType: 'Order',
        newValues: { sendMethod, telegramMessageId: telegramMessageId ?? null },
      })
    );
    return { sendMethod, telegramMessageId };
  }

  // MANUAL_FALLBACK: the user receives the pre-composed message and deep link.
  // The order stays DRAFT — ORDER_SENT is only written after actual delivery.
  // sentAt is kept populated (set during the reservation) so the 60-second duplicate
  // guard remains effective for repeated fallback calls. Consumers of sentAt on DRAFT
  // orders must check sendMethod to distinguish "fallback pending" from "not yet sent".
  await withAudit(
    async (tx) => {
      await tx.order.updateMany({
        where: { id: orderId, userId, status: 'DRAFT' },
        data: { sendMethod },
      });
    },
    () => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_MANUAL_FALLBACK_PROVIDED' as const,
      resourceId: orderId,
      resourceType: 'Order',
      newValues: { sendMethod },
    })
  );
  return {
    sendMethod,
    fallbackText: messageText,
    fallbackDeepLink: buildFallbackDeepLink(order.vendor.telegramUsername),
  };
}
