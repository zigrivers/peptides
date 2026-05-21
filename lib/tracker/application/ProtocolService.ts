import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import { validateCreateInput, validateUpdateInput } from '../domain/validation';
import {
  createProtocolRecord,
  updateProtocolRecord,
  findProtocolByIdForActor,
  listProtocolsForUser,
} from '../infrastructure/ProtocolRepo';
import type { Protocol, CreateProtocolInput, UpdateProtocolInput } from '../domain/types';

async function getManagedUserIds(actorUserId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { managedBy: actorUserId, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Returns true if actorUserId may create/edit a protocol for subjectUserId:
 * allowed for self-assignment, or when subjectUserId is one of the actor's managed users.
 */
export async function isAuthorizedSubject(
  actorUserId: string,
  subjectUserId: string
): Promise<boolean> {
  if (actorUserId === subjectUserId) return true;
  const managedIds = await getManagedUserIds(actorUserId);
  return managedIds.includes(subjectUserId);
}

export async function getProtocolsForUser(userId: string): Promise<Protocol[]> {
  return listProtocolsForUser(prisma, userId);
}

export async function getProtocolById(
  protocolId: string,
  actorUserId: string
): Promise<Protocol | null> {
  const managedIds = await getManagedUserIds(actorUserId);
  return prisma.$transaction(async (tx) =>
    findProtocolByIdForActor(tx, protocolId, actorUserId, managedIds)
  );
}

export async function createProtocol(input: CreateProtocolInput): Promise<Protocol> {
  validateCreateInput(input);

  return withAudit(
    async (tx) =>
      createProtocolRecord(tx, {
        userId: input.subjectUserId,
        compoundId: input.compoundId,
        cycleId: input.cycleId,
        dose: input.dose,
        schedule: input.schedule,
        administrationRoute: input.administrationRoute,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
      }),
    (protocol) => ({
      actorUserId: input.actorUserId,
      subjectUserId: input.subjectUserId,
      category: 'Protocol' as const,
      action: 'PROTOCOL_CREATED' as const,
      resourceId: protocol.id,
      resourceType: 'Protocol',
      newValues: {
        compoundId: protocol.compoundId,
        dose: protocol.dose as unknown as JsonValue,
        schedule: protocol.schedule as unknown as JsonValue,
        administrationRoute: protocol.administrationRoute,
        startDate: protocol.startDate.toISOString(),
      },
    }),
    prisma
  );
}

export async function updateProtocol(input: UpdateProtocolInput): Promise<Protocol> {
  validateUpdateInput(input);

  const managedIds = await getManagedUserIds(input.actorUserId);

  return prisma.$transaction(async (tx) => {
    const existing = await findProtocolByIdForActor(
      tx,
      input.protocolId,
      input.actorUserId,
      managedIds
    );
    if (!existing) {
      throw new Error(`Protocol not found: ${input.protocolId}`);
    }

    const oldValues: JsonValue = {
      dose: existing.dose as unknown as JsonValue,
      schedule: existing.schedule as unknown as JsonValue,
    };

    const updated = await updateProtocolRecord(tx, input.protocolId, existing.userId, {
      compoundId: input.compoundId,
      dose: input.dose,
      schedule: input.schedule,
      administrationRoute: input.administrationRoute,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: existing.userId,
        category: 'Protocol',
        action: 'PROTOCOL_UPDATED',
        resourceId: input.protocolId,
        resourceType: 'Protocol',
        oldValues,
        newValues: {
          dose: updated.dose as unknown as JsonValue,
          schedule: updated.schedule as unknown as JsonValue,
        },
      },
    });

    return updated;
  });
}
