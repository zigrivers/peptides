import { randomUUID, createHash } from 'crypto';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';
import { ITEM_FORMS, VENDOR_CURRENCIES } from '@/lib/ordering/domain/types';
import type { OrderLineItemInput, SendMethod } from '@/lib/ordering/domain/types';
import { sendTelegramMessage } from '@/lib/ordering/infrastructure/MTProtoClient';
import { getDecryptedSession, buildFallbackDeepLink } from './TelegramAuthService';
import { findCompoundsByIds } from '@/lib/reference/infrastructure/CompoundRepo';

type OrderForSend = Prisma.OrderGetPayload<{
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
        // new Decimal(...).toString() strips trailing zeros so '5.000' renders as '5mg', not '5.000mg'.
        `- ${i.quantity}x ${i.compoundName} ${new Decimal(i.vialSizeMg.toString()).toString()}mg (${i.form === 'LYOPHILIZED_POWDER' ? 'lyophilized' : 'solution'})`
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

  // Validate manual pricing fields for non-product items before hitting the DB.
  for (const item of merged) {
    if (item.productId == null) {
      if (item.unitPrice != null) {
        try { new Decimal(item.unitPrice); } catch { throw new Error('invalid_unit_price'); }
      }
      if (item.unitCurrency != null && !(VENDOR_CURRENCIES as readonly string[]).includes(item.unitCurrency)) {
        throw new Error('invalid_unit_currency');
      }
    }
  }

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
  const order: OrderForSend | null = await prisma.order.findFirst({
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
  // Indeterminate state: a prior automated send reached Telegram but the telegramMessageId
  // pre-write failed (process crash in the ~1ms window). sendMethod is null because the
  // MANUAL_FALLBACK path never ran. Re-sending after the 60s cooldown would duplicate the
  // Telegram message. Require manual reconciliation before retrying.
  if (order.messageText && !order.telegramMessageId && !order.sendMethod) {
    throw new Error('send_state_indeterminate');
  }

  const itemsForMessage = order.items.map((i) => ({
    compoundName: i.compound?.name ?? i.compoundId,
    form: i.form,
    vialSizeMg: i.vialSizeMg,
    quantity: i.quantity,
  }));

  const messageText = composeMessage(order.vendor, itemsForMessage);
  if (messageText.length > 4096) throw new Error('message_too_long');

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
    // pg_try_advisory_xact_lock on hash(userId:vendorId:messageText) serializes concurrent
    // requests with the same content, fully closing the READ COMMITTED race window where
    // two transactions could otherwise both pass the findFirst dup check before either commits.
    type CheckAndReserveResult = { blocked: true; duplicateOrderId: string | null } | { blocked: false };

    const sentAt = new Date();
    const checkAndReserve = await withAudit<CheckAndReserveResult>(
      async (tx) => {
        if (!force) {
          const lockHash = createHash('sha256').update(`${userId}:${order.vendorId}:${messageText}`).digest();
          const key1 = lockHash.readInt32BE(0);
          const key2 = lockHash.readInt32BE(4);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [{ acquired }] = (await (tx as any).$queryRaw(
            Prisma.sql`SELECT pg_try_advisory_xact_lock(${key1}::int4, ${key2}::int4) AS acquired`
          )) as [{ acquired: boolean }];
          if (!acquired) return { blocked: true, duplicateOrderId: null };

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
      }
    } catch (err) {
      console.error('[OrderService] Telegram send failed, falling back to manual:', err);
    }

    // Persist messageId outside the catch scope: a DB failure after confirmed Telegram
    // delivery must throw rather than silently fall back, because the user would
    // attempt a re-send for a message Telegram already delivered.
    if (telegramMessageId) {
      await prisma.order.updateMany({
        where: { id: orderId, userId, status: 'DRAFT' },
        data: { telegramMessageId },
      });
      sendMethod = 'AUTOMATED';
      console.info('[OrderService] Telegram send succeeded', { orderId, messageId: telegramMessageId });
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
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: 'DRAFT' },
        data: { sendMethod },
      });
      if (count === 0) throw new Error('invalid_order_transition');
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

// ---------------------------------------------------------------------------
// State machine helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ['RECEIVED', 'CANCELLED'] as const;
export const NON_TERMINAL_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'PAYMENT_SENT', 'STALE'] as const;
const STALE_ORDER_THRESHOLD_DAYS = 14;

export interface OrderSummary {
  id: string;
  status: string;
  vendorName: string;
  itemCount: number;
  createdAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
  staleFlaggedAt: Date | null;
}

export async function cancelOrder(userId: string, orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new Error('order_not_found');
  if ((TERMINAL_STATUSES as readonly string[]).includes(order.status)) {
    throw new Error('invalid_order_transition');
  }
  const now = new Date();
  await withAudit(
    async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: { notIn: [...TERMINAL_STATUSES] } },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId: userId },
      });
      if (count === 0) throw new Error('invalid_order_transition');
    },
    () => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_CANCELLED' as const,
      resourceId: orderId,
      resourceType: 'Order',
      oldValues: { status: order.status },
      newValues: { status: 'CANCELLED' },
    })
  );
}

// markOrdersStale is a system-level cron operation (ADR-012, POST /api/cron/stale-orders).
// It intentionally queries orders across all users — approved exception in AGENTS.md.
// Each per-order updateMany includes both id AND userId for defence-in-depth, and audit
// events are only written for rows where count === 1 (guarding against TOCTOU races where
// the order status changed between the initial findMany and the transaction).
export async function markOrdersStale(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_ORDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const staleOrders = await prisma.order.findMany({
    where: { status: 'SENT', sentAt: { lt: cutoff }, staleFlaggedAt: null },
    select: { id: true, userId: true },
  });
  if (staleOrders.length === 0) return 0;

  let actuallyStaled = 0;
  await prisma.$transaction(async (tx) => {
    for (const order of staleOrders) {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, userId: order.userId, status: 'SENT' },
        data: { status: 'STALE', staleFlaggedAt: now },
      });
      if (count === 1) {
        actuallyStaled++;
        await PrismaAuditRepo.create(tx, {
          actorUserId: 'SYSTEM',
          subjectUserId: order.userId,
          category: 'Order',
          action: 'ORDER_MARKED_STALE',
          resourceId: order.id,
          resourceType: 'Order',
          oldValues: { status: 'SENT' },
          newValues: { status: 'STALE' },
        });
      }
    }
  });
  return actuallyStaled;
}

export async function getStaleOrderCount(userId: string): Promise<number> {
  return prisma.order.count({ where: { userId, status: 'STALE' } });
}

export async function listOrders(userId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      vendor: { select: { name: true } },
      items: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    vendorName: o.vendor.name,
    itemCount: o.items.length,
    createdAt: o.createdAt,
    sentAt: o.sentAt,
    cancelledAt: o.cancelledAt,
    staleFlaggedAt: o.staleFlaggedAt,
  }));
}

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    vendor: { select: { name: true; telegramUsername: true } };
    items: { include: { compound: { select: { name: true } } } };
  };
}>;

export async function getOrderWithDetails(
  userId: string,
  orderId: string
): Promise<OrderWithDetails | null> {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      vendor: { select: { name: true, telegramUsername: true } },
      items: { include: { compound: { select: { name: true } } } },
    },
  });
}

export interface ConfirmQuoteInput {
  walletAddress: string;
  amount: string;
  currency: string;
}

export async function confirmQuote(
  userId: string,
  orderId: string,
  input: ConfirmQuoteInput
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new Error('order_not_found');
  if (order.status !== 'SENT' && order.status !== 'STALE' && order.status !== 'CONFIRMED') {
    throw new Error('invalid_order_transition');
  }
  const now = new Date();
  await withAudit(
    async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: { in: ['SENT', 'STALE', 'CONFIRMED'] } },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
          paymentConfirmation: {
            walletAddress: input.walletAddress.trim(),
            amount: input.amount,
            currency: input.currency,
          },
        },
      });
      if (count === 0) throw new Error('invalid_order_transition');
    },
    () => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_CONFIRMED' as const,
      resourceId: orderId,
      resourceType: 'Order',
      oldValues: { status: order.status },
      newValues: { status: 'CONFIRMED' },
    })
  );
}

export async function markPaymentSent(userId: string, orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new Error('order_not_found');
  if (order.status !== 'CONFIRMED') throw new Error('invalid_order_transition');
  if (!order.paymentConfirmation) throw new Error('payment_not_confirmed');
  const now = new Date();
  await withAudit(
    async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: 'CONFIRMED' },
        data: { status: 'PAYMENT_SENT', paymentSentAt: now },
      });
      if (count === 0) throw new Error('invalid_order_transition');
    },
    () => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_PAYMENT_SENT' as const,
      resourceId: orderId,
      resourceType: 'Order',
      oldValues: { status: 'CONFIRMED' },
      newValues: { status: 'PAYMENT_SENT' },
    })
  );
}

export async function receiveOrder(userId: string, orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: { select: { id: true, compoundId: true, form: true, vialSizeMg: true, quantity: true } } },
  });
  if (!order) throw new Error('order_not_found');
  // Idempotent: already received — safe to return without creating duplicate vials
  if (order.status === 'RECEIVED') return;
  if (order.status !== 'PAYMENT_SENT') throw new Error('invalid_order_transition');
  const now = new Date();

  const vialRows = order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      userId,
      compoundId: item.compoundId,
      orderItemId: item.id,
      totalMg: item.vialSizeMg,
      remainingMg: item.vialSizeMg,
      // SOLUTION items arrive pre-mixed; LYOPHILIZED_POWDER arrives dry
      status: item.form === 'SOLUTION' ? 'RECONSTITUTED' : 'DRY',
    }))
  );

  await withAudit(
    async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: 'PAYMENT_SENT' },
        data: { status: 'RECEIVED', receivedAt: now },
      });
      if (count === 0) throw new Error('invalid_order_transition');
      await tx.vial.createMany({ data: vialRows });
    },
    () => ({
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_RECEIVED' as const,
      resourceId: orderId,
      resourceType: 'Order',
      oldValues: { status: 'PAYMENT_SENT' },
      newValues: { status: 'RECEIVED', vialsCreated: vialRows.length },
    })
  );
}

export async function getPriorWalletAddress(
  userId: string,
  vendorId: string,
  excludeOrderId?: string
): Promise<string | null> {
  const orders = await prisma.order.findMany({
    where: {
      userId,
      vendorId,
      paymentConfirmation: { not: Prisma.AnyNull },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { paymentConfirmation: true },
    orderBy: { confirmedAt: 'desc' },
    take: 1,
  });
  if (orders.length === 0) return null;
  const conf = orders[0].paymentConfirmation as { walletAddress?: string } | null;
  return conf?.walletAddress ?? null;
}
