import { withAudit } from '@/lib/audit/application/withAudit';
import { encryptSession, decryptSession } from './SessionManager';
import { startPhoneAuth, completePhoneAuth, completePhoneAuthWithPassword, logoutSession } from '@/lib/ordering/infrastructure/MTProtoClient';
import { saveSession, getSession, deactivateSession } from '@/lib/ordering/infrastructure/TelegramSessionRepo';
import { createFlow, getAndValidateFlow, updateFlowSession, deleteFlow } from './TelegramFlowStore';

export async function initiateTelegramLink(
  userId: string,
  phone: string
): Promise<{ flowId: string; phoneCodeHash: string }> {
  const { phoneCodeHash, tempSession } = await startPhoneAuth(phone);
  const flowId = createFlow(userId, tempSession);
  return { flowId, phoneCodeHash };
}

export async function completeTelegramLink(
  userId: string,
  phone: string,
  phoneCodeHash: string,
  code: string,
  flowId: string
): Promise<{ passwordRequired: false } | { passwordRequired: true; flowId: string }> {
  const flow = getAndValidateFlow(flowId, userId);
  const result = await completePhoneAuth(phone, phoneCodeHash, code, flow.tempSession);

  if (result.type === 'password_required') {
    // GramJS returns a new session containing auth state needed for CheckPassword.
    updateFlowSession(flowId, result.tempSession);
    return { passwordRequired: true, flowId };
  }

  const encrypted = encryptSession(result.sessionString);
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
  // Delete only after a successful save — preserves state if the DB write fails.
  deleteFlow(flowId);

  return { passwordRequired: false };
}

export async function completeTelegramLinkWithPassword(
  userId: string,
  password: string,
  flowId: string
): Promise<void> {
  const flow = getAndValidateFlow(flowId, userId);

  const { sessionString } = await completePhoneAuthWithPassword(password, flow.tempSession);
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
  // Delete only after the session is saved — allows password retries within the TTL
  // if the user mistyped, without forcing them to re-request the SMS code.
  deleteFlow(flowId);
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
  const normalized = vendorTelegramUsername.trim().replace(/^@+/, '');
  return `tg://resolve?domain=${encodeURIComponent(normalized)}`;
}
