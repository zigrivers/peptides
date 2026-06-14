import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { isLocalResearchEnabled } from '@/lib/ai/infrastructure/localModelClient';
import { runCompoundResearch, type ProgressEvent } from '@/lib/research/application/compoundResearch';
import { runResearchInputSchema } from '@/lib/research/domain/schemas';
import { createRateLimiter } from '@/lib/shared/rateLimiter';

const encoder = new TextEncoder();

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // allow the long local generation (Route Handler, streamed)

// Best-effort per-process limiter (see ADR-017 "Rate-limit caveat").
const limiter = createRateLimiter(5, 60 * 60_000);

function ndjsonString(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

function ndjsonBytes(obj: unknown): Uint8Array {
  return encoder.encode(ndjsonString(obj));
}

function singleEvent(event: ProgressEvent, status = 200): Response {
  return new Response(ndjsonString(event), {
    status,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ catalogItemId: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  const userId = session.user.id;

  const { catalogItemId } = await ctx.params;

  if (!(await isLocalResearchEnabled())) {
    return singleEvent({ phase: 'error', code: 'feature_disabled' });
  }
  if (!limiter.check(`research:${userId}`)) {
    return singleEvent({ phase: 'error', code: 'rate_limited' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return singleEvent({ phase: 'error', code: 'invalid_input' });
  }
  const parsed = runResearchInputSchema.safeParse(body);
  if (!parsed.success) return singleEvent({ phase: 'error', code: 'invalid_input' });

  const compound = await prisma.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: { id: true, name: true, profile: { select: { expectedBenefitsSummary: true } }, supplementProfile: { select: { expectedBenefitsSummary: true } } },
  });
  if (!compound) return singleEvent({ phase: 'error', code: 'compound_not_found' }, 404);

  const profileSummary = compound.profile?.expectedBenefitsSummary ?? compound.supplementProfile?.expectedBenefitsSummary ?? '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ProgressEvent) => controller.enqueue(ndjsonBytes(e));
      try {
        await runCompoundResearch(
          { catalogItemId: compound.id, compoundName: compound.name, profileSummary, question: parsed.data.question, actorUserId: userId },
          send
        );
      } catch {
        send({ phase: 'error', code: 'research_failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}
