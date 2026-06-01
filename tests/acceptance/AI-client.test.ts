/**
 * Task 5.4 — AI Layer (ADR-010)
 *
 * Tests the AIClient orchestrator: fail-over, retry, timeout, audit
 * emission, and the cardinal rule that AI failures must NOT block the
 * caller in a way that propagates upstream as a 500 (they throw a
 * structured `AIUnavailableError` that the caller can catch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();
const mockGetAnthropicModel = vi.fn();
const mockGetGeminiModel = vi.fn();
const mockGetDeepSeekModel = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));
vi.mock('@/lib/ai/infrastructure/anthropicClient', () => ({
  getAnthropicModel: mockGetAnthropicModel,
}));
vi.mock('@/lib/ai/infrastructure/geminiClient', () => ({
  getGeminiModel: mockGetGeminiModel,
}));
vi.mock('@/lib/ai/infrastructure/deepseekClient', () => ({
  getDeepSeekModel: mockGetDeepSeekModel,
}));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    // AI audit writes go directly through PrismaAuditRepo.create(prisma, ...)
    // — no transaction wrapper since these are single-row writes with no
    // accompanying mutation to keep atomic.
    auditEvent: { create: mockAuditCreate },
  },
}));

const stubModel = { id: 'stub' };

beforeEach(() => {
  vi.resetAllMocks();
  mockGetAnthropicModel.mockResolvedValue(stubModel);
  mockGetGeminiModel.mockResolvedValue(stubModel);
  mockGetDeepSeekModel.mockResolvedValue(stubModel);
  mockGenerateObject.mockResolvedValue({ object: { ok: true } });
  mockGenerateText.mockResolvedValue({ text: 'hello world' });
});

afterEach(() => {
  vi.useRealTimers();
});

const { callObject, callText } = await import('@/lib/ai/application/AIClient');
const schema = z.object({ ok: z.boolean() });

describe('AIClient.callObject — provider fail-over', () => {
  it('AC-1: returns Anthropic result and never calls Gemini when it succeeds', async () => {
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    // Both models exist but only Anthropic should have been invoked.
    expect(mockGetAnthropicModel).toHaveBeenCalled();
    expect(mockGetGeminiModel).not.toHaveBeenCalled();
  });

  it('AC-1b: emits AI_REQUEST_INITIATED audit', async () => {
    await callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AI_REQUEST_INITIATED' }),
      })
    );
  });

  it('AC-3: retries once on transient Anthropic failure then succeeds', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('upstream_500'))
      .mockResolvedValueOnce({ object: { ok: true } });
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetGeminiModel).not.toHaveBeenCalled();
  });

  it('AC-4: falls over to Gemini when Anthropic fails twice', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('upstream_500'))
      .mockRejectedValueOnce(new Error('upstream_500'))
      .mockResolvedValueOnce({ object: { ok: true } });
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetGeminiModel).toHaveBeenCalled();
  });

  it('AC-4b: falls over to DeepSeek when Anthropic and Gemini are unavailable', async () => {
    // Both leading providers have no API key → return null. DeepSeek (the
    // appended tertiary provider) must be reached and produce the result.
    mockGetAnthropicModel.mockResolvedValue(null);
    mockGetGeminiModel.mockResolvedValue(null);
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetDeepSeekModel).toHaveBeenCalled();
    // Only DeepSeek did real generation work (the first two were unavailable).
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('AC-4c: DeepSeek is a last resort — not reached when Gemini succeeds', async () => {
    mockGetAnthropicModel.mockResolvedValue(null);
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetDeepSeekModel).not.toHaveBeenCalled();
  });

  it('AC-4d: throws AIUnavailableError only after all three providers fail', async () => {
    mockGetAnthropicModel.mockResolvedValue(null);
    mockGetGeminiModel.mockResolvedValue(null);
    mockGetDeepSeekModel.mockResolvedValue(null);
    await expect(
      callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema })
    ).rejects.toThrow('ai_unavailable');
    expect(mockGetDeepSeekModel).toHaveBeenCalled();
  });

  it('AC-5: throws AIUnavailableError when both providers fail and audits failure', async () => {
    mockGenerateObject.mockRejectedValue(new Error('boom'));
    await expect(
      callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema })
    ).rejects.toThrow('ai_unavailable');
    const failedAudits = mockAuditCreate.mock.calls.filter(
      (call) => call[0]?.data?.action === 'AI_REQUEST_FAILED'
    );
    expect(failedAudits).toHaveLength(1);
    // Audit metadata captures the error labels — but NOT the prompt content.
    const meta = failedAudits[0][0].data.metadata;
    expect(Array.isArray(meta.errors)).toBe(true);
    expect(meta.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('AC-5b: audit error codes are sanitised to fixed labels (no raw SDK messages)', async () => {
    // Reject with a message containing a fake "prompt fragment" — this must
    // NOT appear in audit metadata, per operations §7.
    mockGenerateObject.mockRejectedValue(
      new Error('Schema validation error: response was {prompt: "user data"}')
    );
    await expect(
      callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema })
    ).rejects.toThrow('ai_unavailable');
    const failedAudit = mockAuditCreate.mock.calls.find(
      (call) => call[0]?.data?.action === 'AI_REQUEST_FAILED'
    );
    const meta = failedAudit?.[0].data.metadata;
    expect(meta.errors).toBeDefined();
    for (const code of meta.errors as string[]) {
      // Each code is `${provider}_${attemptN}:${classifierLabel}`.
      const label = code.split(':')[1];
      expect(['timeout', 'aborted', 'invalid_schema', 'provider_error']).toContain(label);
      // Never leak the raw message content.
      expect(code).not.toContain('prompt');
      expect(code).not.toContain('user data');
    }
  });

  it('AC-1c: no API keys → all getModel functions return null → throws AIUnavailableError', async () => {
    mockGetAnthropicModel.mockResolvedValue(null);
    mockGetGeminiModel.mockResolvedValue(null);
    mockGetDeepSeekModel.mockResolvedValue(null);
    await expect(
      callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema })
    ).rejects.toThrow('ai_unavailable');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('AC-5c: a provider whose init throws still falls through to the next provider', async () => {
    // Anthropic init blows up (e.g. broken SDK shape, env-var malformed).
    mockGetAnthropicModel.mockRejectedValueOnce(new Error('anthropic_sdk_shape_unexpected'));
    mockGenerateObject.mockResolvedValueOnce({ object: { ok: true } });
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetGeminiModel).toHaveBeenCalled();
  });

  it('AC-6: Anthropic returns Zod-invalid output → no retry on same provider, falls over to Gemini', async () => {
    // First Anthropic attempt: parse throws. Per the no-retry-on-deterministic-error
    // rule, the orchestrator must NOT call generateObject a second time on
    // Anthropic — it should fall through to Gemini immediately.
    mockGenerateObject
      .mockResolvedValueOnce({ object: { ok: 'not-a-bool' } })
      .mockResolvedValueOnce({ object: { ok: true } });
    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
    });
    expect(result).toEqual({ ok: true });
    expect(mockGetGeminiModel).toHaveBeenCalled();
    // 1 Anthropic + 1 Gemini call exactly.
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });
});

describe('AIClient.callObject — timeout & abort', () => {
  it('AC-7: aborts a hung Anthropic call after timeoutMs and falls through to retry/Gemini', async () => {
    // First Anthropic attempt: never resolves until the abort signal fires.
    // Second Anthropic attempt: succeeds immediately.
    let attempts = 0;
    mockGenerateObject.mockImplementation(async (opts: { abortSignal?: AbortSignal }) => {
      attempts++;
      if (attempts === 1) {
        return new Promise((_resolve, reject) => {
          opts.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return { object: { ok: true } };
    });

    const result = await callObject({
      operation: 'extract_citation',
      system: 's',
      prompt: 'p',
      schema,
      timeoutMs: 50,
    });
    expect(result).toEqual({ ok: true });
    // First attempt should have been aborted; second succeeded → Gemini untouched.
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(mockGetGeminiModel).not.toHaveBeenCalled();
  });
});

describe('AIClient.callText', () => {
  it('returns the model text on success', async () => {
    const result = await callText({ operation: 'draft_compound_profile', system: 's', prompt: 'p' });
    expect(result).toBe('hello world');
  });

  it('treats empty text as invalid_schema → no retry on same provider, falls through Gemini then DeepSeek', async () => {
    // Three empty responses (Anthropic → Gemini → DeepSeek), each treated as
    // deterministic-failure → no retry. A fourth call would prove an extra
    // retry; the call must throw after exactly one attempt per provider.
    mockGenerateText
      .mockResolvedValueOnce({ text: '' }) // Anthropic
      .mockResolvedValueOnce({ text: '' }) // Gemini
      .mockResolvedValueOnce({ text: '' }) // DeepSeek
      .mockResolvedValueOnce({ text: 'unreachable' });
    await expect(
      callText({ operation: 'draft_compound_profile', system: 's', prompt: 'p' })
    ).rejects.toThrow('ai_unavailable');
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });
});
