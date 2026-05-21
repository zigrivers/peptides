import { withAudit } from '@/lib/audit/application/withAudit';
import { encryptSession, decryptSession } from './SessionManager';
import { startPhoneAuth, completePhoneAuth, logoutSession } from '@/lib/ordering/infrastructure/MTProtoClient';
import { saveSession, getSession, deactivateSession } from '@/lib/ordering/infrastructure/TelegramSessionRepo';

export async function initiateTelegramLink(phone: string): Promise<{ phoneCodeHash: string; tempSession: string }> {
  return startPhoneAuth(phone);
}

export async function completeTelegramLink(
  userId: string,
  phone: string,
  phoneCodeHash: string,
  code: string,
  tempSession: string
): Promise<void> {
  const { sessionString } = await completePhoneAuth(phone, phoneCodeHash, code, tempSession);
  const encrypted = encryptSession(sessionString);

  await withAudit(
    async (tx) => {
      await saveSession(userId, encrypted, undefined, tx);
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
  // Attempt clean Telegram-side logout before removing the local record.
  // Best-effort: session may already be invalid on Telegram's servers.
  const existing = await getSession(userId);
  if (existing) {
    try {
      const plain = decryptSession(existing.sessionString);
      await logoutSession(plain);
    } catch {
      // Proceed with local cleanup regardless of Telegram-side errors.
    }
  }

  await withAudit(
    async (tx) => {
      await deactivateSession(userId, tx);
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
  const normalized = vendorTelegramUsername.replace('@', '');
  return `tg://resolve?domain=${encodeURIComponent(normalized)}`;
}
