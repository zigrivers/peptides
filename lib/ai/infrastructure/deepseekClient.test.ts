import { describe, it, expect, afterEach, vi } from 'vitest';

// Intercept the dynamic `import('@ai-sdk/deepseek')` inside the client so the
// test never reaches the real SDK. The fake factory echoes the model id back
// so we can assert the client wires the requested model through.
vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => (id: string) => ({ id, provider: 'deepseek' })),
}));

import { getDeepSeekModel, __resetDeepSeekClientForTesting } from './deepseekClient';

afterEach(() => {
  __resetDeepSeekClientForTesting();
  delete process.env.DEEPSEEK_API_KEY;
  vi.clearAllMocks();
});

describe('getDeepSeekModel', () => {
  it('returns null when DEEPSEEK_API_KEY is unset (graceful degradation)', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(await getDeepSeekModel('deepseek-chat')).toBeNull();
  });

  it('returns a model from the SDK factory when the key is present', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const model = await getDeepSeekModel('deepseek-chat');
    expect(model).toEqual({ id: 'deepseek-chat', provider: 'deepseek' });
  });
});
