import type { LanguageModel } from 'ai';

type LanguageModelV1 = LanguageModel;

let _factory: ((modelId: string) => LanguageModelV1) | null = null;

export async function getGeminiModel(modelId: string): Promise<LanguageModelV1 | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!_factory) {
    const mod = await import('@ai-sdk/google');
    const createGoogleGenerativeAI =
      mod.createGoogleGenerativeAI ?? mod.default?.createGoogleGenerativeAI;
    if (typeof createGoogleGenerativeAI !== 'function') {
      throw new Error('gemini_sdk_shape_unexpected');
    }
    const provider = createGoogleGenerativeAI({ apiKey });
    _factory = (id: string) => provider(id);
  }
  return _factory(modelId);
}

export function __resetGeminiClientForTesting(): void {
  _factory = null;
}
