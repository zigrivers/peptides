import type { LanguageModel } from 'ai';

type LanguageModelV1 = LanguageModel;

/**
 * Lazy DeepSeek provider (ADR-010 tertiary provider) — mirrors the
 * Anthropic/Gemini lazy-init pattern. Module import is side-effect free so a
 * build without DEEPSEEK_API_KEY (CI, dev without env) doesn't blow up; the
 * orchestrator falls through to / from this provider gracefully when the key
 * is absent (returns null).
 */

let _factory: ((modelId: string) => LanguageModelV1) | null = null;

export async function getDeepSeekModel(modelId: string): Promise<LanguageModelV1 | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  if (!_factory) {
    const mod = await import('@ai-sdk/deepseek');
    const createDeepSeek = mod.createDeepSeek ?? mod.default?.createDeepSeek;
    if (typeof createDeepSeek !== 'function') {
      throw new Error('deepseek_sdk_shape_unexpected');
    }
    const provider = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
    _factory = (id: string) => provider(id) as unknown as LanguageModelV1;
  }
  return _factory(modelId);
}

export function __resetDeepSeekClientForTesting(): void {
  _factory = null;
}
