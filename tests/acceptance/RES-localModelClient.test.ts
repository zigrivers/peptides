import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateOpenAICompatible = vi.fn();
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (...a: unknown[]) => mockCreateOpenAICompatible(...a),
}));

import {
  getLocalModel,
  resolveLocalModelId,
  isLocalModelReachable,
  isCompoundResearchEnabled,
  __resetLocalModelClientForTesting,
} from '@/lib/ai/infrastructure/localModelClient';

const ORIG_ENV = { ...process.env };

describe('localModelClient', () => {
  beforeEach(() => {
    __resetLocalModelClientForTesting();
    mockCreateOpenAICompatible.mockReset();
    vi.restoreAllMocks();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it('getLocalModel returns null when LOCAL_LLM_BASE_URL is unset', async () => {
    delete process.env.LOCAL_LLM_BASE_URL;
    expect(await getLocalModel()).toBeNull();
  });

  it('resolveLocalModelId uses LOCAL_LLM_MODEL override without calling /models', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    process.env.LOCAL_LLM_MODEL = 'my-model';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await resolveLocalModelId()).toBe('my-model');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolveLocalModelId reads the first model id from GET /models and caches it', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    delete process.env.LOCAL_LLM_MODEL;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'orchestrator-xyz' }] }), { status: 200 })
    );
    expect(await resolveLocalModelId()).toBe('orchestrator-xyz');
    expect(await resolveLocalModelId()).toBe('orchestrator-xyz'); // cached
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('isLocalModelReachable returns false (never throws) on fetch error', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await isLocalModelReachable()).toBe(false);
  });

  it('isCompoundResearchEnabled is false when flag is off even if reachable', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    process.env.COMPOUND_RESEARCH_ENABLED = 'false';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 })
    );
    expect(await isCompoundResearchEnabled()).toBe(false);
  });

  it('isCompoundResearchEnabled is true when flag on AND reachable', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    process.env.COMPOUND_RESEARCH_ENABLED = 'true';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 })
    );
    expect(await isCompoundResearchEnabled()).toBe(true);
  });

  it('resolveLocalModelId retries the /models fetch after a prior failure (cache cleared on error)', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    delete process.env.LOCAL_LLM_MODEL;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'm2' }] }), { status: 200 }));
    await expect(resolveLocalModelId()).rejects.toThrow();
    expect(await resolveLocalModelId()).toBe('m2');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('isLocalModelReachable caches a successful ping within the TTL (one fetch)', async () => {
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:8001/v1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await isLocalModelReachable()).toBe(true);
    expect(await isLocalModelReachable()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
