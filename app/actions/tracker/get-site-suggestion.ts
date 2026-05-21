'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getSiteSuggestion } from '@/lib/tracker/application/SiteRotationService';
import type { SiteSuggestion } from '@/lib/tracker/domain/SiteRotation';

const InputSchema = z.object({
  protocolId: z.string().min(1),
});

type ActionResult =
  | ({ ok: true } & SiteSuggestion)
  | { ok: false; message: string };

export async function getSiteSuggestionAction(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: 'Unauthorized' };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.message };

  try {
    const result = await getSiteSuggestion(session.user.id, parsed.data.protocolId);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}
