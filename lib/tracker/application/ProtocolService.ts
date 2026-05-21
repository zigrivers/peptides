import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import { validateCreateInput, validateUpdateInput } from '../domain/validation';
import {
  createProtocolRecord,
  updateProtocolRecord,
  findProtocolByIdForUser,
  listProtocolsForUser,
} from '../infrastructure/ProtocolRepo';
import type { Protocol, CreateProtocolInput, UpdateProtocolInput } from '../domain/types';

export async function getProtocolsForUser(userId: string): Promise<Protocol[]> {
  return listProtocolsForUser(prisma, userId);
}

export async function getProtocolById(protocolId: string, userId: string): Promise<Protocol | null> {
  return prisma.$transaction(async (tx) => findProtocolByIdForUser(tx, protocolId, userId));
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

  return prisma.$transaction(async (tx) => {
    const existing = await findProtocolByIdForUser(tx, input.protocolId, input.actorUserId);
    if (!existing) {
      throw new Error(`Protocol not found: ${input.protocolId}`);
    }

    const oldValues: JsonValue = {
      dose: existing.dose as unknown as JsonValue,
      schedule: existing.schedule as unknown as JsonValue,
    };

    const updated = await updateProtocolRecord(tx, input.protocolId, {
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
