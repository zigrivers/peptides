import { generateObject, generateText, type LanguageModel } from 'ai';
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
 * Falls back to generateText + strict-parse + Zod validate on ANY structured-output
 * failure EXCEPT genuine timeout/abort (which must fail closed). This covers
 * NoObjectGeneratedError, wrong-shape objects (ZodError), and unsupported
 * responseFormat on local endpoints.
 */
export async function tryGenerateObjectOrParse<T>({ model, schema, system, prompt, abortSignal, maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS }: Args<T>): Promise<T> {
  try {
    const { object } = await generateObject({ model, schema, system, prompt, maxRetries: 0, maxOutputTokens, abortSignal });
    return schema.parse(object);
  } catch (err) {
    // Fail closed on a real timeout/abort — do NOT mask it with a text retry.
    if (
      err instanceof Error &&
      (err.name === 'AbortError' ||
        err.name === 'TimeoutError' ||
        err.message === 'ai_timeout' ||
        err.message === 'aborted')
    ) {
      throw err;
    }
    // Any other structured-output failure (no object, wrong shape/ZodError, unsupported
    // responseFormat on a local endpoint) → fall back to plain text + tolerant parse.
    const { text } = await generateText({
      model,
      system: `${system}\n\nRespond with ONLY a single JSON value matching the requested shape. No prose, no markdown fences, no explanation.`,
      prompt,
      maxRetries: 0,
      maxOutputTokens,
      abortSignal,
    });
    const json = extractJson(text);
    if (!json) throw new Error('local_text_fallback_no_json');
    return schema.parse(JSON.parse(json));
  }
}
