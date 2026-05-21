'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createRateLimiter } from '@/lib/shared/rateLimiter';
import {
  initiateTelegramLink,
  completeTelegramLink,
  unlinkTelegram,
  getSessionStatus,
} from '@/lib/ordering/application/TelegramAuthService';

export type TelegramAuthError =
  | 'unauthorized'
  | 'validation_error'
  | 'rate_limited'
  | 'mtproto_connection_error'
  | 'invalid_code'
  | 'system_error';

export type TelegramAuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: TelegramAuthError; message?: string };

const PhoneSchema = z.object({ phone: z.string().min(7).max(20) });
const CompleteSchema = z.object({
  phone: z.string().min(7).max(20),
  phoneCodeHash: z.string().min(1),
  code: z.string().min(4).max(8),
});

// 3 initiate requests per user per hour — prevents abuse of Telegram's SendCode API.
const initiateLimiter = createRateLimiter(3, 60 * 60 * 1000);

export async function initiateTelegramLinkAction(
  rawInput: unknown
): Promise<TelegramAuthResult<{ phoneCodeHash: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  if (!initiateLimiter.check(session.user.id))
    return { ok: false, error: 'rate_limited', message: 'Too many requests. Try again in an hour.' };

  const parsed = PhoneSchema.safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: 'validation_error', message: parsed.error.issues.map((i) => i.message).join(', ') };

  try {
    const result = await initiateTelegramLink(parsed.data.phone);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('connection') || msg.includes('connect'))
      return { ok: false, error: 'mtproto_connection_error', message: msg };
    return { ok: false, error: 'system_error' };
  }
}

export async function completeTelegramLinkAction(
  rawInput: unknown
): Promise<TelegramAuthResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = CompleteSchema.safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: 'validation_error', message: parsed.error.issues.map((i) => i.message).join(', ') };

  try {
    await completeTelegramLink(
      session.user.id,
      parsed.data.phone,
      parsed.data.phoneCodeHash,
      parsed.data.code
    );
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('PHONE_CODE_INVALID') || msg.includes('code'))
      return { ok: false, error: 'invalid_code', message: 'Verification code is incorrect' };
    if (msg.includes('connection') || msg.includes('connect'))
      return { ok: false, error: 'mtproto_connection_error', message: msg };
    return { ok: false, error: 'system_error' };
  }
}

export async function unlinkTelegramAction(): Promise<TelegramAuthResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    await unlinkTelegram(session.user.id);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'system_error' };
  }
}

export async function getTelegramStatusAction(): Promise<TelegramAuthResult<{ linked: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    const status = await getSessionStatus(session.user.id);
    return { ok: true, data: status };
  } catch {
    return { ok: false, error: 'system_error' };
  }
}
