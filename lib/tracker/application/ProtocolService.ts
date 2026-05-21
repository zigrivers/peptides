import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import { validateCreateInput, validateUpdateInput } from '../domain/validation';
import {
  createProtocolRecord,
  updateProtocolRecord,
  transitionProtocolStatus,
  findProtocolByIdForActor,
  listProtocolsForUser,
} from '../infrastructure/ProtocolRepo';
import type { Protocol, CreateProtocolInput, UpdateProtocolInput } from '../domain/types';

type LifecycleInput = { actorUserId: string; protocolId: string };
type CloneInput = LifecycleInput & { newStartDate: Date };

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
  // Single read — no $transaction needed; avoids unnecessary round-trip overhead
  return findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
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

async function requireProtocolForActor(
  tx: Parameters<typeof findProtocolByIdForActor>[0],
  protocolId: string,
  actorUserId: string
): Promise<Protocol> {
  const managedIds = await getManagedUserIds(actorUserId);
  const protocol = await findProtocolByIdForActor(tx, protocolId, actorUserId, managedIds);
  if (!protocol) throw new Error(`Protocol not found: ${protocolId}`);
  return protocol;
}

export async function pauseProtocol(input: LifecycleInput): Promise<Protocol> {
  return prisma.$transaction(async (tx) => {
    const protocol = await requireProtocolForActor(tx, input.protocolId, input.actorUserId);
    if (protocol.status === 'PAUSED') throw new Error('Protocol is already paused');
    if (protocol.status === 'COMPLETED' || protocol.status === 'DEACTIVATED') {
      throw new Error(`Cannot pause a ${protocol.status.toLowerCase()} protocol`);
    }

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'PAUSED');

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: protocol.userId,
        category: 'Protocol',
        action: 'PROTOCOL_PAUSED',
        resourceId: input.protocolId,
        resourceType: 'Protocol',
        oldValues: { status: protocol.status },
        newValues: { status: 'PAUSED' },
      },
    });

    return updated;
  });
}

export async function resumeProtocol(input: LifecycleInput): Promise<Protocol> {
  return prisma.$transaction(async (tx) => {
    const protocol = await requireProtocolForActor(tx, input.protocolId, input.actorUserId);
    if (protocol.status !== 'PAUSED') throw new Error('Protocol is not paused');

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'ACTIVE');

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: protocol.userId,
        category: 'Protocol',
        action: 'PROTOCOL_RESUMED',
        resourceId: input.protocolId,
        resourceType: 'Protocol',
        oldValues: { status: 'PAUSED' },
        newValues: { status: 'ACTIVE' },
      },
    });

    return updated;
  });
}

export async function cloneProtocol(input: CloneInput): Promise<Protocol> {
  return prisma.$transaction(async (tx) => {
    const source = await requireProtocolForActor(tx, input.protocolId, input.actorUserId);
    if (source.status === 'DEACTIVATED') {
      throw new Error('Cannot clone a deactivated protocol');
    }

    const cloned = await createProtocolRecord(tx, {
      userId: source.userId,
      compoundId: source.compoundId,
      cycleId: source.cycleId ?? undefined,
      dose: source.dose,
      schedule: source.schedule,
      administrationRoute: source.administrationRoute,
      startDate: input.newStartDate,
      notes: source.notes ?? undefined,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: source.userId,
        category: 'Protocol',
        action: 'PROTOCOL_CLONED',
        resourceId: cloned.id,
        resourceType: 'Protocol',
        metadata: { sourceProtocolId: input.protocolId },
      },
    });

    return cloned;
  });
}

export async function deactivateProtocol(input: LifecycleInput): Promise<Protocol> {
  return prisma.$transaction(async (tx) => {
    const protocol = await requireProtocolForActor(tx, input.protocolId, input.actorUserId);
    if (protocol.status === 'DEACTIVATED') throw new Error('Protocol is already deactivated');
    if (protocol.status === 'COMPLETED') {
      throw new Error('Cannot deactivate a completed protocol');
    }

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'DEACTIVATED');

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: protocol.userId,
        category: 'Protocol',
        action: 'PROTOCOL_DEACTIVATED',
        resourceId: input.protocolId,
        resourceType: 'Protocol',
        oldValues: { status: protocol.status },
        newValues: { status: 'DEACTIVATED' },
      },
    });

    return updated;
  });
}
