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
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ auditEvent: { create: mockAuditCreate } }),
  },
}));

const stubModel = { id: 'stub' };

beforeEach(() => {
  vi.resetAllMocks();
  mockGetAnthropicModel.mockResolvedValue(stubModel);
  mockGetGeminiModel.mockResolvedValue(stubModel);
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

  it('AC-1c: no API keys → both getModel functions return null → throws AIUnavailableError', async () => {
    mockGetAnthropicModel.mockResolvedValue(null);
    mockGetGeminiModel.mockResolvedValue(null);
    await expect(
      callObject({ operation: 'extract_citation', system: 's', prompt: 'p', schema })
    ).rejects.toThrow('ai_unavailable');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('AC-6: Anthropic returns Zod-invalid output → falls over to Gemini', async () => {
    mockGenerateObject
      .mockResolvedValueOnce({ object: { ok: 'not-a-bool' } }) // first Anthropic attempt: parse() throws
      .mockResolvedValueOnce({ object: { ok: 'still-bad' } }) // second Anthropic attempt: same
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

  it('treats empty text as a failure and falls through', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: '' })
      .mockResolvedValueOnce({ text: '' })
      .mockResolvedValueOnce({ text: 'finally' });
    const result = await callText({
      operation: 'draft_compound_profile',
      system: 's',
      prompt: 'p',
    });
    expect(result).toBe('finally');
  });
});
