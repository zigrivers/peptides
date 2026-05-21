import type { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '../infrastructure/PrismaAuditRepo';
import type { CreateAuditEventInput } from '../domain/AuditEvent';

/**
 * Wraps a mutation and its audit-event write in a single Prisma transaction.
 * If either the mutation or the audit write throws, the entire transaction
 * is rolled back — guaranteeing audit completeness (ADR-009, tdd-standards §3.2).
 *
 * Parameter order (mutation first) ensures callers can always derive resourceId
 * and newValues from the DB-generated mutation result without pre-computing IDs.
 *
 * @param mutation - The database write(s) to perform inside the transaction.
 * @param buildAudit - Audit event fields, or a factory that receives the mutation
 *   result (use the factory form when resourceId is a DB-generated ID).
 * @param client - Optional: pass an existing PrismaClient to start a new $transaction,
 *   or a TransactionClient to join an existing transaction without nesting.
 */
export async function withAudit<T>(
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  buildAudit: CreateAuditEventInput | ((result: T) => CreateAuditEventInput),
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<T> {
  const runInTx = async (tx: Prisma.TransactionClient): Promise<T> => {
    const result = await mutation(tx);
    const input = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
    await PrismaAuditRepo.create(tx, input);
    return result;
  };

  if ('$transaction' in client && typeof (client as PrismaClient).$transaction === 'function') {
    return (client as PrismaClient).$transaction(runInTx);
  }
  return runInTx(client as Prisma.TransactionClient);
}
