import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';

type PrismaTx = Prisma.TransactionClient;

export async function saveSession(
  userId: string,
  encryptedSession: string,
  serverIp?: string,
  tx?: PrismaTx
): Promise<void> {
  const client = tx ?? prisma;
  await client.telegramSession.upsert({
    where: { userId },
    create: { userId, sessionString: encryptedSession, isActive: true, lastConnectedIp: serverIp ?? null },
    update: { sessionString: encryptedSession, isActive: true, lastConnectedIp: serverIp ?? null },
  });
}

export async function getSession(userId: string): Promise<{ sessionString: string; lastConnectedIp: string | null } | null> {
  const row = await prisma.telegramSession.findUnique({
    where: { userId },
    select: { sessionString: true, lastConnectedIp: true, isActive: true },
  });
  if (!row || !row.isActive) return null;
  return { sessionString: row.sessionString, lastConnectedIp: row.lastConnectedIp };
}

export async function deactivateSession(userId: string, tx?: PrismaTx): Promise<void> {
  const client = tx ?? prisma;
  // deleteMany avoids P2025 if the session was already removed (e.g. concurrent tab/race).
  await client.telegramSession.deleteMany({ where: { userId } });
}
