import { prisma } from '@/lib/shared/prisma';

export async function saveSession(userId: string, encryptedSession: string, serverIp?: string): Promise<void> {
  await prisma.telegramSession.upsert({
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

export async function deactivateSession(userId: string): Promise<void> {
  await prisma.telegramSession.delete({ where: { userId } });
}
