import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '../infrastructure/PrismaAuditRepo';
import type { CreateAuditEventInput } from '../domain/AuditEvent';

/**
 * Wraps a mutation and its audit-event write in a single Prisma transaction.
 * If either the mutation or the audit write throws, the entire transaction
 * is rolled back — guaranteeing audit completeness (ADR-009, tdd-standards §3.2).
 */
export async function withAudit<T>(
  auditInput: CreateAuditEventInput,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await mutation(tx);
    await PrismaAuditRepo.create(tx, auditInput);
    return result;
  });
}
