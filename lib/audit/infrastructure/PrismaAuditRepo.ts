import type { Prisma } from '@prisma/client';
import type { CreateAuditEventInput } from '../domain/AuditEvent';

/**
 * AuditRepo: create-only — audit events are immutable by design (ADR-009).
 * No update or delete methods exist to enforce immutability at the application layer.
 * The repository accepts a TransactionClient so callers can share a Prisma transaction
 * with their mutation (see withAudit).
 *
 * metadata/oldValues/newValues are typed as JsonValue (domain type) which only contains
 * serializable primitives — no functions or symbols — making the Prisma cast safe.
 */
export const PrismaAuditRepo = {
  async create(tx: Prisma.TransactionClient, input: CreateAuditEventInput) {
    return tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: input.subjectUserId,
        category: input.category,
        action: input.action,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        // JsonValue is a recursive serializable-only type; the cast to InputJsonValue is
        // safe because all JsonValue members map to valid Prisma JSON inputs.
        ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonValue }),
        ...(input.oldValues !== undefined && { oldValues: input.oldValues as Prisma.InputJsonValue }),
        ...(input.newValues !== undefined && { newValues: input.newValues as Prisma.InputJsonValue }),
      },
    });
  },
};
