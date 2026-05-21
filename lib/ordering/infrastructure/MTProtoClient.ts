import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

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

export async function startPhoneAuth(phone: string): Promise<{ phoneCodeHash: string }> {
  const client = makeClient();
  await client.connect();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Api } = await import('telegram') as any;
    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: getCredentials().apiId,
        apiHash: getCredentials().apiHash,
        settings: new Api.CodeSettings({}),
      })
    );
    return { phoneCodeHash: result.phoneCodeHash };
  } finally {
    await client.disconnect();
  }
}

export async function completePhoneAuth(
  phone: string,
  phoneCodeHash: string,
  code: string
): Promise<{ sessionString: string }> {
  const client = makeClient();
  await client.connect();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Api } = await import('telegram') as any;
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })
    );
    const sessionString = client.session.save() as unknown as string;
    return { sessionString };
  } finally {
    await client.disconnect();
  }
}

export async function checkSession(encryptedSession: string, decryptFn: (s: string) => string): Promise<boolean> {
  try {
    const plain = decryptFn(encryptedSession);
    const client = makeClient(plain);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    return true;
  } catch {
    return false;
  }
}
