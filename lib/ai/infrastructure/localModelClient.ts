import type { LanguageModel } from 'ai';

/**
 * Lazy, env-gated provider for the operator's LOCAL OpenAI-compatible model
 * (ADR-017). Side-effect-free import: returns null when LOCAL_LLM_BASE_URL is
 * unset so builds/deploys without the local stack don't break. Never falls back
 * to a paid provider — the feature simply hides when unreachable.
 */

function disableThinking(): boolean {
  // Default ON: the configured local model is a reasoning model that is far too slow
  // unless thinking is disabled. Set LOCAL_LLM_DISABLE_THINKING="false" to keep thinking.
  return process.env.LOCAL_LLM_DISABLE_THINKING !== 'false';
}

const thinkingFetch: typeof fetch = async (input, init) => {
  if (disableThinking() && init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed && Array.isArray(parsed.messages)) {
        parsed.chat_template_kwargs = {
          ...((parsed.chat_template_kwargs as Record<string, unknown>) ?? {}),
          enable_thinking: false,
        };
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // non-JSON body — leave untouched
    }
  }
  return globalThis.fetch(input, init);
};

let _factory: ((modelId: string) => LanguageModel) | null = null;
let _modelIdPromise: Promise<string> | null = null;
let _reach: { value: boolean; at: number } | null = null;
const REACH_TTL_MS = 30_000;

function baseUrl(): string | null {
  return process.env.LOCAL_LLM_BASE_URL ?? null;
}

async function getFactory(): Promise<((modelId: string) => LanguageModel) | null> {
  const base = baseUrl();
  if (!base) return null;
  if (!_factory) {
    const mod = await import('@ai-sdk/openai-compatible');
    const create = mod.createOpenAICompatible;
    if (typeof create !== 'function') throw new Error('openai_compatible_sdk_shape_unexpected');
    const provider = create({
      name: 'local',
      baseURL: base,
      apiKey: process.env.LOCAL_LLM_API_KEY ?? 'not-needed',
      fetch: thinkingFetch,
    });
    _factory = (id: string) => provider(id) as unknown as LanguageModel;
  }
  return _factory;
}

/** Resolve the model id once: override via LOCAL_LLM_MODEL, else GET {base}/models. */
export async function resolveLocalModelId(): Promise<string> {
  const override = process.env.LOCAL_LLM_MODEL;
  if (override && override.trim().length > 0) return override.trim();
  const base = baseUrl();
  if (!base) throw new Error('local_model_base_url_unset');
  // Cache the in-flight promise to dedupe a cold-start stampede.
  if (!_modelIdPromise) {
    _modelIdPromise = (async () => {
      const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`local_models_http_${res.status}`);
      const json = (await res.json()) as { data?: { id?: string }[] };
      const id = json.data?.[0]?.id;
      if (!id) throw new Error('local_models_empty');
      return id;
    })().catch((err) => {
      _modelIdPromise = null; // allow retry on next call
      throw err;
    });
  }
  return _modelIdPromise;
}

/** Returns a ready-to-use LanguageModel, or null when the local stack isn't configured. */
export async function getLocalModel(): Promise<LanguageModel | null> {
  const factory = await getFactory();
  if (!factory) return null;
  const id = await resolveLocalModelId();
  return factory(id);
}

/** Cheap reachability ping, TTL-cached, never throws. */
export async function isLocalModelReachable(): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false;
  const now = Date.now();
  if (_reach && now - _reach.at < REACH_TTL_MS) return _reach.value;
  let value = false;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(2500) });
    value = res.ok;
  } catch {
    value = false;
  }
  _reach = { value, at: now };
  return value;
}

/** Feature gate: flag ON and endpoint reachable. Never throws. */
export async function isCompoundResearchEnabled(): Promise<boolean> {
  if (process.env.COMPOUND_RESEARCH_ENABLED !== 'true') return false;
  return isLocalModelReachable();
}

export function __resetLocalModelClientForTesting(): void {
  _factory = null;
  _modelIdPromise = null;
  _reach = null;
}
