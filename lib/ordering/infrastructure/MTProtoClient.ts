import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { computeCheck } from 'telegram/Password';

function getCredentials() {
  const apiId = process.env.TELEGRAM_APP_ID;
  const apiHash = process.env.TELEGRAM_APP_HASH;
  if (!apiId || !apiHash) throw new Error('TELEGRAM_APP_ID / TELEGRAM_APP_HASH not configured');
  return { apiId: parseInt(apiId, 10), apiHash };
}

function makeClient(sessionString = '') {
  const { apiId, apiHash } = getCredentials();
  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });
}

// Returns phoneCodeHash AND a temporary session string (auth_key) that must be
// passed to completePhoneAuth — GramJS requires the same auth_key for both steps.
export async function startPhoneAuth(phone: string): Promise<{ phoneCodeHash: string; tempSession: string }> {
  const client = makeClient();
  await client.connect();
  try {
    const { apiId, apiHash } = getCredentials();
    // TypeSentCode is a union — SentCode carries phoneCodeHash for the standard SMS flow.
    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({}),
      })
    ) as Api.auth.SentCode;
    // Save auth_key in session so SignIn can reuse it.
    const tempSession = client.session.save() as unknown as string;
    return { phoneCodeHash: result.phoneCodeHash, tempSession };
  } finally {
    await client.disconnect();
  }
}

// tempSession is the auth_key-containing session from startPhoneAuth — required by Telegram
// to authenticate the SignIn request using the same connection identity.
export async function completePhoneAuth(
  phone: string,
  phoneCodeHash: string,
  code: string,
  tempSession: string
): Promise<{ type: 'success'; sessionString: string } | { type: 'password_required'; tempSession: string }> {
  const client = makeClient(tempSession);
  await client.connect();
  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })
    );
    const sessionString = client.session.save() as unknown as string;
    return { type: 'success', sessionString };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('SESSION_PASSWORD_NEEDED')) {
      // Preserve the current session (which contains the auth_key) for the password step.
      const updatedSession = client.session.save() as unknown as string;
      return { type: 'password_required', tempSession: updatedSession };
    }
    throw err;
  } finally {
    await client.disconnect();
  }
}

// Called when Telegram requires a 2FA password after the SMS code step.
// Uses SRP (Secure Remote Password) to verify without sending the password in plaintext.
export async function completePhoneAuthWithPassword(
  password: string,
  tempSession: string
): Promise<{ sessionString: string }> {
  const client = makeClient(tempSession);
  await client.connect();
  try {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const check = await computeCheck(passwordInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: check }));
    const sessionString = client.session.save() as unknown as string;
    return { sessionString };
  } finally {
    await client.disconnect();
  }
}

export async function logoutSession(plainSessionString: string): Promise<void> {
  const client = makeClient(plainSessionString);
  await client.connect();
  try {
    await client.invoke(new Api.auth.LogOut());
  } catch {
    // Session may already be invalid on Telegram's side — ignore, proceed with local cleanup.
  } finally {
    await client.disconnect();
  }
}

export async function sendTelegramMessage(
  sessionString: string,
  recipientUsername: string,
  text: string
): Promise<{ messageId: string }> {
  const client = makeClient(sessionString);
  await client.connect();
  try {
    const result = await client.sendMessage(recipientUsername, { message: text });
    return { messageId: String(result.id) };
  } finally {
    // Catch disconnect errors separately: a disconnect failure must not mask a successful
    // sendMessage, which would cause OrderService to offer manual fallback for a
    // message that Telegram already delivered (duplicate-send risk).
    try { await client.disconnect(); } catch (err) { console.error('[MTProtoClient] disconnect error (non-fatal):', err); }
  }
}

export async function checkSession(encryptedSession: string, decryptFn: (s: string) => string): Promise<boolean> {
  let client: ReturnType<typeof makeClient> | null = null;
  try {
    const plain = decryptFn(encryptedSession);
    client = makeClient(plain);
    await client.connect();
    await client.getMe();
    return true;
  } catch {
    return false;
  } finally {
    await client?.disconnect();
  }
}
