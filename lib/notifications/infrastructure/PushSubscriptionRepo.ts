import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { PushSubscriptionInput } from '../domain/types';

type TxOrPrisma = Prisma.TransactionClient | typeof prisma;

export interface PushSubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
}

export const PushSubscriptionRepo = {
  /**
   * Endpoint-uniqueness ownership lookup. The endpoint column is `@unique` so
   * we MUST verify ownership before overwriting; otherwise a malicious caller
   * could hijack another user's device by submitting their endpoint. See
   * AGENTS.md "Auth Scoping" — this read is an approved boundary (returns only
   * id + userId; the result is used to enforce ownership before any write).
   */
  async findByEndpoint(
    endpoint: string,
    client: TxOrPrisma = prisma
  ): Promise<PushSubscriptionRow | null> {
    const row = await client.pushSubscription.findUnique({
      where: { endpoint },
      select: { id: true, userId: true, endpoint: true },
    });
    return row;
  },

  async create(
    userId: string,
    input: PushSubscriptionInput,
    client: TxOrPrisma = prisma
  ): Promise<{ id: string }> {
    const row = await client.pushSubscription.create({
      data: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      select: { id: true },
    });
    return row;
  },

  async updateKeys(
    id: string,
    userId: string,
    input: PushSubscriptionInput,
    client: TxOrPrisma = prisma
  ): Promise<{ count: number }> {
    return client.pushSubscription.updateMany({
      where: { id, userId },
      data: { p256dh: input.p256dh, auth: input.auth },
    });
  },

  async deleteByEndpoint(
    userId: string,
    endpoint: string,
    client: TxOrPrisma = prisma
  ): Promise<{ count: number }> {
    return client.pushSubscription.deleteMany({ where: { userId, endpoint } });
  },

  async listByUser(
    userId: string,
    client: TxOrPrisma = prisma
  ): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
    return client.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
  },
};
