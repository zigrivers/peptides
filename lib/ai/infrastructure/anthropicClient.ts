import type { LanguageModel } from 'ai';
import type { ModelId } from '../domain/types';

type LanguageModelV1 = LanguageModel;

/**
 * Lazy Anthropic provider — mirrors the Resend lazy-init pattern in
 * `lib/shared/email.ts`. Module import is side-effect free so a build
 * without ANTHROPIC_API_KEY (CI, dev without env) doesn't blow up.
 */

let _factory: ((modelId: string) => LanguageModelV1) | null = null;

export async function getAnthropicModel(modelId: ModelId): Promise<LanguageModelV1 | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_factory) {
    const mod = await import('@ai-sdk/anthropic');
    const createAnthropic = mod.createAnthropic ?? mod.default?.createAnthropic;
    if (typeof createAnthropic !== 'function') {
      throw new Error('anthropic_sdk_shape_unexpected');
    }
    const provider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    _factory = (id: string) => provider(id);
  }
  return _factory(modelId);
}

export function __resetAnthropicClientForTesting(): void {
  _factory = null;
}
