import { expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuditAction, AuditCategory } from '@/lib/audit/domain/AuditEvent';

/**
 * Shared assertion helper for integration tests that verify audit events were emitted.
 * Every integration test for a sensitive mutation MUST use this helper — not ad-hoc
 * Prisma queries — to enforce the canonical category + action vocabulary (tdd-standards §3.2).
 *
 * orderBy: { timestamp: 'desc' } ensures the most recent matching event is returned,
 * preventing false positives when multiple events share the same category/action.
 */
export async function expectAuditEvent(
  db: PrismaClient,
  match: {
    category: AuditCategory;
    action: AuditAction;
    actorUserId: string;
    resourceId?: string;
  }
) {
  const event = await db.auditEvent.findFirst({
    where: match,
    orderBy: { timestamp: 'desc' },
  });
  if (!event) {
    throw new Error(`Expected audit event matching ${JSON.stringify(match)} — none found`);
  }
  expect(event.category).toBe(match.category);
  expect(event.action).toBe(match.action);
  expect(event.actorUserId).toBe(match.actorUserId);
  return event;
}
