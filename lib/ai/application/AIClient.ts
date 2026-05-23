import { generateObject, generateText } from 'ai';
import type { z } from 'zod';
import { getAnthropicModel } from '../infrastructure/anthropicClient';
import { getGeminiModel } from '../infrastructure/geminiClient';
import {
  AIInvalidResponseError,
  AIUnavailableError,
  MODEL_IDS,
  type AIOperation,
  type ModelId,
} from '../domain/types';
import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';

/**
 * Provider fail-over orchestrator (ADR-010). Implements:
 *  - timeout (default 30s)
 *  - retry-once with 1s backoff per provider
 *  - Anthropic → Gemini fall-through
 *  - structured output via Zod when callers want it
 *  - audit emission for initiated + failed requests (no prompt content)
 *
 * Failures throw `AIUnavailableError` so callers can degrade gracefully —
 * AI must NEVER block user-facing flows (dose logging, ordering, etc.).
 */

export const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_MS = 1_000;

export interface CallOptions {
  operation: AIOperation;
  /** System prompt — eligible for Anthropic prompt caching. */
  system: string;
  /** User prompt — the per-request input. */
  prompt: string;
  /** Optional timeout override (per-attempt). */
  timeoutMs?: number;
  /** Optional actor for audit attribution; defaults to SYSTEM (cron). */
  actorUserId?: string;
}

export interface CallObjectOptions<T> extends CallOptions {
  schema: z.ZodSchema<T>;
}

interface ProviderAttempt {
  provider: 'anthropic' | 'gemini';
  modelId: string;
}

function attemptsFor(operation: AIOperation): ProviderAttempt[] {
  // Per ADR-010: cost-sensitive batch jobs use Haiku, drafting uses Sonnet.
  const anthropicModel =
    operation === 'extract_citation' ? MODEL_IDS.anthropicHaiku : MODEL_IDS.anthropicSonnet;
  return [
    { provider: 'anthropic', modelId: anthropicModel },
    { provider: 'gemini', modelId: MODEL_IDS.geminiPro },
  ];
}

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('ai_timeout'));
    }, ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
  try {
    return await Promise.race([task(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function emitAuditInitiated(opts: { operation: AIOperation; actorUserId: string }) {
  await prisma.$transaction(async (tx) => {
    await PrismaAuditRepo.create(tx, {
      actorUserId: opts.actorUserId,
      category: 'Security',
      action: 'AI_REQUEST_INITIATED',
      resourceId: opts.operation,
      resourceType: 'AIRequest',
    });
  });
}

async function emitAuditFailed(opts: {
  operation: AIOperation;
  actorUserId: string;
  errors: string[];
}) {
  await prisma.$transaction(async (tx) => {
    await PrismaAuditRepo.create(tx, {
      actorUserId: opts.actorUserId,
      category: 'Security',
      action: 'AI_REQUEST_FAILED',
      resourceId: opts.operation,
      resourceType: 'AIRequest',
      metadata: { errors: opts.errors },
    });
  });
}

async function getModelFor(
  attempt: ProviderAttempt
): Promise<Awaited<ReturnType<typeof getAnthropicModel>> | null> {
  if (attempt.provider === 'anthropic') return getAnthropicModel(attempt.modelId as ModelId);
  return getGeminiModel(attempt.modelId);
}

async function runWithRetry<T>(
  attempt: ProviderAttempt,
  task: (
    model: NonNullable<Awaited<ReturnType<typeof getModelFor>>>,
    signal: AbortSignal
  ) => Promise<T>,
  timeoutMs: number,
  errors: string[]
): Promise<T | null> {
  const model = await getModelFor(attempt);
  if (!model) return null;
  try {
    return await withTimeout((signal) => task(model, signal), timeoutMs);
  } catch (err) {
    errors.push(`${attempt.provider}_1:${(err as Error).message ?? 'unknown'}`);
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    try {
      return await withTimeout((signal) => task(model, signal), timeoutMs);
    } catch (err2) {
      errors.push(`${attempt.provider}_2:${(err2 as Error).message ?? 'unknown'}`);
      return null;
    }
  }
}

/** Generate a Zod-validated structured object. */
export async function callObject<T>(opts: CallObjectOptions<T>): Promise<T> {
  const actorUserId = opts.actorUserId ?? 'SYSTEM';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  await emitAuditInitiated({ operation: opts.operation, actorUserId }).catch(() => null);
  const errors: string[] = [];
  for (const attempt of attemptsFor(opts.operation)) {
    const result = await runWithRetry(
      attempt,
      async (model, signal) => {
        const { object } = await generateObject({
          model,
          system: opts.system,
          prompt: opts.prompt,
          schema: opts.schema,
          abortSignal: signal,
        });
        // Defense-in-depth: re-validate the SDK's parsed object against the
        // Zod schema before returning. The SDK already validates, but a
        // mis-typed provider response could otherwise leak through.
        return opts.schema.parse(object);
      },
      timeoutMs,
      errors
    );
    if (result !== null) return result;
  }
  await emitAuditFailed({ operation: opts.operation, actorUserId, errors }).catch(() => null);
  throw new AIUnavailableError(errors.join('; '));
}

/** Generate plain text (for free-form draft outputs that aren't structured). */
export async function callText(opts: CallOptions): Promise<string> {
  const actorUserId = opts.actorUserId ?? 'SYSTEM';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  await emitAuditInitiated({ operation: opts.operation, actorUserId }).catch(() => null);
  const errors: string[] = [];
  for (const attempt of attemptsFor(opts.operation)) {
    const result = await runWithRetry(
      attempt,
      async (model, signal) => {
        const { text } = await generateText({
          model,
          system: opts.system,
          prompt: opts.prompt,
          abortSignal: signal,
        });
        if (typeof text !== 'string' || text.length === 0) {
          throw new AIInvalidResponseError();
        }
        return text;
      },
      timeoutMs,
      errors
    );
    if (result !== null) return result;
  }
  await emitAuditFailed({ operation: opts.operation, actorUserId, errors }).catch(() => null);
  throw new AIUnavailableError(errors.join('; '));
}
