import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';
import { prisma } from '@/lib/shared/prisma';
import type { Prisma } from '@prisma/client';

// Prisma unique-constraint violation code
const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === code
  );
}

export const EmailChangeRepo = {
  async create(
    tx: Prisma.TransactionClient,
    userId: string,
    oldEmail: string,
    newEmail: string
  ): Promise<string> {
    const { rawToken, tokenHash } = EmailChangeToken.generate();
    await tx.emailChangeRequest.create({
      data: {
        userId,
        oldEmail,
        newEmail,
        tokenHash,
        expiresAt: EmailChangeToken.verifyExpiry(),
        status: 'PENDING',
      },
    });
    return rawToken;
  },

  async findByRawToken(rawToken: string): Promise<{
    id: string;
    userId: string;
    oldEmail: string;
    newEmail: string;
    createdAt: Date;
    expiresAt: Date;
    status: string;
    appliedAt: Date | null;
    revertibleUntil: Date | null;
    verifiedAt: Date | null;
  } | null> {
    const hash = EmailChangeToken.hash(rawToken);
    return prisma.emailChangeRequest.findUnique({
      where: { tokenHash: hash },
      select: {
        id: true,
        userId: true,
        oldEmail: true,
        newEmail: true,
        createdAt: true,
        expiresAt: true,
        status: true,
        appliedAt: true,
        revertibleUntil: true,
        verifiedAt: true,
      },
    });
  },

  // Cancels all PENDING tokens for the user (call before creating a new token).
  async cancelPending(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.emailChangeRequest.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  },

  // Atomically marks the request APPLIED and updates the user's email in one transaction.
  async applyById(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    newEmail: string
  ): Promise<boolean> {
    const now = new Date();
    const revertibleUntil = EmailChangeToken.revertExpiry(now);

    // Include expiresAt guard to close the validation→update TOCTOU window
    const { count } = await tx.emailChangeRequest.updateMany({
      where: { id, userId, status: 'PENDING', expiresAt: { gt: now } },
      data: {
        status: 'APPLIED',
        verifiedAt: now,
        appliedAt: now,
        revertibleUntil,
      },
    });
    if (count !== 1) return false;

    try {
      await tx.user.update({
        where: { id: userId },
        data: { email: newEmail },
      });
    } catch (err) {
      if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) throw new Error('email_already_in_use');
      throw err;
    }
    return true;
  },

  // Atomically marks the request REVERTED and restores the user's email.
  // createdAt: the creation time of THIS token, used to only cancel NEWER APPLIED tokens.
  // This prevents an attacker from reverting a later change to cancel an earlier victim revert token.
  async revertById(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    oldEmail: string,
    createdAt: Date
  ): Promise<boolean> {
    const now = new Date();
    // Include revertibleUntil guard to close the validation→update TOCTOU window
    const { count } = await tx.emailChangeRequest.updateMany({
      where: { id, userId, status: 'APPLIED', revertibleUntil: { gt: now } },
      data: { status: 'REVERTED' },
    });
    if (count !== 1) return false;

    // Cancel any PENDING tokens (prevent new changes from being applied after recovery) AND
    // any APPLIED tokens created AFTER this one (prevent forward-chaining attacks).
    // We deliberately do NOT cancel older APPLIED tokens to preserve their revert rights.
    await tx.emailChangeRequest.updateMany({
      where: {
        userId,
        id: { not: id },
        OR: [
          { status: 'PENDING' },
          { status: 'APPLIED', createdAt: { gt: createdAt }, revertibleUntil: { gt: now } },
        ],
      },
      data: { status: 'CANCELLED' },
    });

    try {
      await tx.user.update({
        where: { id: userId },
        data: { email: oldEmail },
      });
    } catch (err) {
      if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) throw new Error('email_already_in_use');
      throw err;
    }
    return true;
  },
};
