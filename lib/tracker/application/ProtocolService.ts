import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { utcMidnightToday } from '@/lib/shared/date';
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
import { getReconstitutedShelfLifeDays } from '@/lib/reference/infrastructure/CompoundRepo';

type LifecycleInput = { actorUserId: string; protocolId: string };
type CloneInput = LifecycleInput & { newStartDate: Date };
type AnyClient = Prisma.TransactionClient | PrismaClient;

async function deactivateOverlappingProtocols(
  tx: Prisma.TransactionClient,
  userId: string,
  compoundId: string,
  newStartDate: Date,
  excludeProtocolId?: string
): Promise<void> {
  const existingActive = (await tx.protocol.findMany({
    where: {
      userId,
      compoundId,
      status: 'ACTIVE',
      id: excludeProtocolId ? { not: excludeProtocolId } : undefined,
    },
  })) || [];

  const newStartUTC = new Date(Date.UTC(
    newStartDate.getUTCFullYear(),
    newStartDate.getUTCMonth(),
    newStartDate.getUTCDate()
  ));

  for (const oldProto of existingActive) {
    const oldStartUTC = new Date(Date.UTC(
      oldProto.startDate.getUTCFullYear(),
      oldProto.startDate.getUTCMonth(),
      oldProto.startDate.getUTCDate()
    ));

    if (newStartUTC <= oldStartUTC) {
      await tx.protocol.update({
        where: { id: oldProto.id },
        data: {
          status: 'DEACTIVATED',
          endDate: oldProto.endDate ?? newStartUTC,
        },
      });

      await tx.doseLog.deleteMany({
        where: {
          protocolId: oldProto.id,
          userId,
          status: 'PENDING',
          scheduledDate: { gte: newStartUTC },
        },
      });
    } else {
      const dayBefore = new Date(newStartUTC);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

      await tx.protocol.update({
        where: { id: oldProto.id },
        data: {
          endDate: dayBefore,
        },
      });

      await tx.doseLog.deleteMany({
        where: {
          protocolId: oldProto.id,
          userId,
          status: 'PENDING',
          scheduledDate: { gte: newStartUTC },
        },
      });
    }
  }
}

/**
 * Resolves the active managed user IDs for a given actor user ID.
 * Supports passing an optional transaction client.
 */
export async function getManagedUserIds(actorUserId: string, client: AnyClient = prisma): Promise<string[]> {
  const users = await client.user.findMany({
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
  const managedIds = await getManagedUserIds(userId);
  return listProtocolsForUser(prisma, [userId, ...managedIds]);
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
    async (tx) => {
      // Deactivate other overlapping active protocols first
      await deactivateOverlappingProtocols(tx, input.subjectUserId, input.compoundId, input.startDate);

      if (input.cycleId) {
        const cycle = await tx.cycle.findFirst({ where: { id: input.cycleId, userId: input.subjectUserId, status: 'ACTIVE' } });
        if (!cycle) throw new Error(`cycle_not_found: cycle does not belong to this user or is not active`);
      }

      if (input.reconstituteVialId && input.initialVial) {
        const dryVial = await tx.vial.findFirst({
          where: { id: input.reconstituteVialId, userId: input.subjectUserId, status: 'DRY' }
        });
        if (!dryVial) {
          throw new Error('dry_vial_not_found: The selected dry vial does not exist or has already been reconstituted.');
        }

        const shelfLifeDays = (await getReconstitutedShelfLifeDays(input.compoundId, tx)) ?? 14;
        const now = new Date();
        const expiresAt = input.initialVial.expiresAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));
        const bacWaterMlDecimal = new Prisma.Decimal(input.initialVial.bacWaterMl);

        // Deactivate other active vials for this compound and user
        await tx.vial.updateMany({
          where: {
            userId: input.subjectUserId,
            compoundId: input.compoundId,
            status: 'RECONSTITUTED',
            isActiveForCompound: true,
          },
          data: { isActiveForCompound: false }
        });

        await tx.vial.update({
          where: { id: input.reconstituteVialId },
          data: {
            bacWaterMl: bacWaterMlDecimal,
            status: 'RECONSTITUTED',
            reconstitutedAt: now,
            expiresAt,
            isActiveForCompound: true,
          }
        });

        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            subjectUserId: input.subjectUserId,
            category: 'Reconstitution',
            action: 'VIAL_RECONSTITUTED',
            resourceId: input.reconstituteVialId,
            resourceType: 'Vial',
            newValues: {
              compoundId: input.compoundId,
              totalMg: dryVial.totalMg.toFixed(3),
              bacWaterMl: bacWaterMlDecimal.toFixed(3),
              expiresAt: expiresAt.toISOString(),
              reconstitutedFromDryVialId: input.reconstituteVialId,
            },
          }
        });
      } else if (input.initialVial) {
        const shelfLifeDays = (await getReconstitutedShelfLifeDays(input.compoundId, tx)) ?? 14;
        const now = new Date();
        const expiresAt = input.initialVial.expiresAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));

        const totalMgDecimal = new Prisma.Decimal(input.initialVial.totalMg);
        const bacWaterMlDecimal = new Prisma.Decimal(input.initialVial.bacWaterMl);

        // Deactivate other active vials for this compound and user
        await tx.vial.updateMany({
          where: {
            userId: input.subjectUserId,
            compoundId: input.compoundId,
            status: 'RECONSTITUTED',
            isActiveForCompound: true,
          },
          data: { isActiveForCompound: false }
        });

        const vial = await tx.vial.create({
          data: {
            userId: input.subjectUserId,
            compoundId: input.compoundId,
            totalMg: totalMgDecimal,
            bacWaterMl: bacWaterMlDecimal,
            remainingMg: totalMgDecimal,
            status: 'RECONSTITUTED',
            reconstitutedAt: now,
            expiresAt,
            isActiveForCompound: true,
          }
        });

        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            subjectUserId: input.subjectUserId,
            category: 'Reconstitution',
            action: 'VIAL_RECONSTITUTED',
            resourceId: vial.id,
            resourceType: 'Vial',
            newValues: {
              compoundId: input.compoundId,
              totalMg: totalMgDecimal.toFixed(3),
              bacWaterMl: bacWaterMlDecimal.toFixed(3),
              expiresAt: expiresAt.toISOString(),
            },
          }
        });
      }

      return createProtocolRecord(tx, {
        userId: input.subjectUserId,
        compoundId: input.compoundId,
        cycleId: input.cycleId,
        dose: input.dose,
        schedule: input.schedule,
        administrationRoute: input.administrationRoute,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
      });
    },
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

    if (updated.status === 'ACTIVE') {
      await deactivateOverlappingProtocols(
        tx,
        existing.userId,
        input.compoundId ?? existing.compoundId,
        input.startDate ?? existing.startDate,
        existing.id
      );
    }

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
  tx: Prisma.TransactionClient,
  protocolId: string,
  actorUserId: string
): Promise<Protocol> {
  const managedIds = await getManagedUserIds(actorUserId, tx);
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

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'PAUSED', protocol.status);

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

    await deactivateOverlappingProtocols(tx, protocol.userId, protocol.compoundId, protocol.startDate, protocol.id);

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'ACTIVE', 'PAUSED');

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

    await deactivateOverlappingProtocols(tx, source.userId, source.compoundId, input.newStartDate);

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

    const updated = await transitionProtocolStatus(tx, input.protocolId, protocol.userId, 'DEACTIVATED', protocol.status);

    await tx.doseLog.deleteMany({
      where: {
        protocolId: input.protocolId,
        userId: protocol.userId,
        status: 'PENDING',
        scheduledDate: { gte: utcMidnightToday() },
      },
    });

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
