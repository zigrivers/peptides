import { expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Shared assertion helper for integration tests that verify audit events were emitted.
 * Every integration test for a sensitive mutation MUST use this helper — not ad-hoc
 * Prisma queries — to enforce the canonical category + action vocabulary (tdd-standards §3.2).
 */
export async function expectAuditEvent(
  db: PrismaClient,
  match: { action: string; actorUserId: string; resourceId?: string }
) {
  const event = await db.auditEvent.findFirst({ where: match });
  if (!event) {
    throw new Error(`Expected audit event matching ${JSON.stringify(match)} — none found`);
  }
  expect(event.action).toBe(match.action);
  expect(event.actorUserId).toBe(match.actorUserId);
  return event;
}
