import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { OrderLineItemInput, SendMethod } from '@/lib/ordering/domain/types';
import { sendTelegramMessage } from '@/lib/ordering/infrastructure/MTProtoClient';
import { getDecryptedSession, buildFallbackDeepLink } from './TelegramAuthService';

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

function mergeItems(items: OrderLineItemInput[]): OrderLineItemInput[] {
  const map = new Map<string, OrderLineItemInput>();
  for (const item of items) {
    const key = `${item.compoundId}:${item.form}:${item.vialSizeMg}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
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
        `- ${i.quantity}x ${i.compoundName} ${i.vialSizeMg.toString()}mg (${i.form === 'LYOPHILIZED_POWDER' ? 'lyophilized' : 'solution'})`
    )
    .join('\n');

  if (vendor.messageTemplate) {
    return vendor.messageTemplate.includes('{ITEMS}')
      ? vendor.messageTemplate.replaceAll('{ITEMS}', itemLines)
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
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId } });
  if (!vendor) throw new Error('vendor_not_found');

  const existing = await prisma.order.findFirst({ where: { userId, idempotencyKey } });
  if (existing) return { orderId: existing.id };

  const merged = mergeItems(items);

  const order = await withAudit(
    async (tx) => {
      const newOrder = await tx.order.create({
        data: { userId, vendorId, idempotencyKey, status: 'DRAFT' },
      });
      await tx.orderItem.createMany({
        data: merged.map((item) => ({
          orderId: newOrder.id,
          compoundId: item.compoundId,
          form: item.form,
          vialSizeMg: item.vialSizeMg,
          quantity: item.quantity,
          productId: item.productId ?? null,
          unitPrice: item.unitPrice ?? null,
          unitCurrency: item.unitCurrency ?? null,
        })),
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

  const itemsForMessage = order.items.map((i) => ({
    compoundName: i.compound?.name ?? i.compoundId,
    form: i.form,
    vialSizeMg: i.vialSizeMg,
    quantity: i.quantity,
  }));

  const messageText = composeMessage(order.vendor, itemsForMessage);

  // 60-second duplicate-send check — includes the current order so a crash-retry
  // (after Telegram sends but before the DB finalize) is also blocked by the
  // pre-send sentAt reservation written below.
  const cutoff = new Date(Date.now() - 60_000);
  const duplicate = await prisma.order.findFirst({
    where: {
      userId,
      vendorId: order.vendorId,
      messageText,
      sentAt: { gte: cutoff },
    },
  });

  if (duplicate && !force) {
    await withAudit(
      async () => { /* audit-only — no DB mutation */ },
      {
        actorUserId: userId,
        category: 'Order' as const,
        action: 'DUPLICATE_SEND_BLOCKED' as const,
        resourceId: orderId,
        resourceType: 'Order',
        metadata: { duplicateOrderId: duplicate.id },
      }
    );
    throw new Error('possible_duplicate_send');
  }

  // Reserve the send slot before external I/O — if the process crashes after a successful
  // Telegram send but before the final DB update, the next retry will find sentAt set and
  // the 60-second duplicate check will block a second send.
  const sentAt = new Date();
  const { count: reserveCount } = await prisma.order.updateMany({
    where: { id: orderId, userId, status: 'DRAFT' },
    data: { messageText, sentAt },
  });
  if (reserveCount === 0) throw new Error('order_not_found_or_not_draft');

  // Attempt Telegram send
  let sendMethod: SendMethod = 'MANUAL_FALLBACK';
  let telegramMessageId: string | undefined;

  try {
    const sessionString = await getDecryptedSession(userId);
    if (sessionString) {
      const result = await sendTelegramMessage(sessionString, order.vendor.telegramUsername, messageText);
      telegramMessageId = result.messageId;
      sendMethod = 'AUTOMATED';
    }
  } catch {
    // Fall through to manual fallback
  }

  // Both AUTOMATED and MANUAL_FALLBACK transition to 'SENT'. The order is finalized
  // regardless of delivery method; sendMethod distinguishes automated from manual dispatch.
  await withAudit(
    async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId },
        data: {
          status: 'SENT',
          sendMethod,
          telegramMessageId: telegramMessageId ?? null,
        },
      });
      if (count === 0) throw new Error('order_not_found');
    },
    {
      actorUserId: userId,
      category: 'Order' as const,
      action: 'ORDER_SENT' as const,
      resourceId: orderId,
      resourceType: 'Order',
      newValues: { sendMethod, telegramMessageId: telegramMessageId ?? null },
    }
  );

  if (sendMethod === 'MANUAL_FALLBACK') {
    return {
      sendMethod,
      fallbackText: messageText,
      fallbackDeepLink: buildFallbackDeepLink(order.vendor.telegramUsername),
    };
  }
  return { sendMethod, telegramMessageId };
}
