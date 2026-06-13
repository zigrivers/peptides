import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const { mockGenerateObject, mockGenerateText, FakeNoObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockGenerateText = vi.fn();
  // NoObjectGeneratedError needs an isInstance static; emulate the ai SDK export.
  class FakeNoObject extends Error { static isInstance(e: unknown) { return e instanceof FakeNoObject; } }
  return { mockGenerateObject, mockGenerateText, FakeNoObject };
});

vi.mock('ai', () => ({
  generateObject: (...a: unknown[]) => mockGenerateObject(...a),
  generateText: (...a: unknown[]) => mockGenerateText(...a),
  NoObjectGeneratedError: FakeNoObject,
}));

import { tryGenerateObjectOrParse } from '@/lib/research/application/localStructuredOutput';

const schema = z.object({ queries: z.array(z.string()).min(1) });
const model = {} as never;

describe('tryGenerateObjectOrParse', () => {
  beforeEach(() => { mockGenerateObject.mockReset(); mockGenerateText.mockReset(); });

  it('returns the object from generateObject on success', async () => {
    mockGenerateObject.mockResolvedValue({ object: { queries: ['a'] } });
    const out = await tryGenerateObjectOrParse({ model, schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ queries: ['a'] });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('falls back to generateText+parse on NoObjectGeneratedError', async () => {
    mockGenerateObject.mockRejectedValue(new FakeNoObject('no json'));
    mockGenerateText.mockResolvedValue({ text: 'prefix {"queries":["b"]} suffix' });
    const out = await tryGenerateObjectOrParse({ model, schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ queries: ['b'] });
  });

  it('does NOT fall back on a timeout error (rethrows)', async () => {
    mockGenerateObject.mockRejectedValue(new Error('ai_timeout'));
    await expect(tryGenerateObjectOrParse({ model, schema, system: 's', prompt: 'p' })).rejects.toThrow('ai_timeout');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('throws when the text fallback cannot be parsed/validated', async () => {
    mockGenerateObject.mockRejectedValue(new FakeNoObject('no json'));
    mockGenerateText.mockResolvedValue({ text: 'no json here' });
    await expect(tryGenerateObjectOrParse({ model, schema, system: 's', prompt: 'p' })).rejects.toBeTruthy();
  });
});
