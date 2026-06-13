import { generateObject, generateText, NoObjectGeneratedError, type LanguageModel } from 'ai';
import type { z } from 'zod';

const DEFAULT_MAX_OUTPUT_TOKENS = 8000;

interface Args<T> {
  model: LanguageModel;
  schema: z.ZodSchema<T>;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}

/** Extract the first balanced JSON object/array from a text blob. */
function extractJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Try structured output via generateObject (maxRetries:0 — local, fail fast).
 * On NoObjectGeneratedError ONLY (local mlx endpoints are inconsistent at JSON
 * mode), fall back to generateText + strict-parse + Zod validate. Timeout/abort/
 * network errors propagate unchanged so the orchestrator fails closed.
 */
export async function tryGenerateObjectOrParse<T>({ model, schema, system, prompt, abortSignal, maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS }: Args<T>): Promise<T> {
  try {
    const { object } = await generateObject({ model, schema, system, prompt, maxRetries: 0, abortSignal, maxOutputTokens });
    return schema.parse(object);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    const { text } = await generateText({
      model,
      system: `${system}\n\nRespond with ONLY a single JSON value matching the requested shape. No prose, no markdown fences.`,
      prompt,
      maxRetries: 0,
      abortSignal,
      maxOutputTokens,
    });
    const json = extractJson(text);
    if (!json) throw new Error('local_text_fallback_no_json');
    return schema.parse(JSON.parse(json));
  }
}
