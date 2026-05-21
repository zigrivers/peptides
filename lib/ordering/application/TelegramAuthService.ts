import { withAudit } from '@/lib/audit/application/withAudit';
import { encryptSession, decryptSession } from './SessionManager';
import { startPhoneAuth, completePhoneAuth } from '@/lib/ordering/infrastructure/MTProtoClient';
import { getSession } from '@/lib/ordering/infrastructure/TelegramSessionRepo';

export async function initiateTelegramLink(phone: string): Promise<{ phoneCodeHash: string }> {
  return startPhoneAuth(phone);
}

export async function completeTelegramLink(
  userId: string,
  phone: string,
  phoneCodeHash: string,
  code: string
): Promise<void> {
  const { sessionString } = await completePhoneAuth(phone, phoneCodeHash, code);
  const encrypted = encryptSession(sessionString);

  await withAudit(
    async (tx) => {
      await tx.telegramSession.upsert({
        where: { userId },
        create: { userId, sessionString: encrypted, isActive: true },
        update: { sessionString: encrypted, isActive: true },
      });
    },
    {
      actorUserId: userId,
      category: 'Security' as const,
      action: 'TELEGRAM_SESSION_LINKED' as const,
      resourceId: userId,
      resourceType: 'TelegramSession',
    }
  );
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await withAudit(
    async (tx) => {
      await tx.telegramSession.delete({ where: { userId } });
    },
    {
      actorUserId: userId,
      category: 'Security' as const,
      action: 'TELEGRAM_SESSION_REVOKED' as const,
      resourceId: userId,
      resourceType: 'TelegramSession',
    }
  );
}

export async function getSessionStatus(userId: string): Promise<{ linked: boolean }> {
  const row = await getSession(userId);
  return { linked: row !== null };
}

export async function getDecryptedSession(userId: string): Promise<string | null> {
  const row = await getSession(userId);
  if (!row) return null;
  return decryptSession(row.sessionString);
}

export function buildFallbackDeepLink(vendorTelegramUsername: string): string {
  return `tg://resolve?domain=${vendorTelegramUsername}`;
}
