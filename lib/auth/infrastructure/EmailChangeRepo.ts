import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';
import type { Prisma } from '@prisma/client';

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
    expiresAt: Date;
    status: string;
    appliedAt: Date | null;
    revertibleUntil: Date | null;
    verifiedAt: Date | null;
  } | null> {
    const { prisma } = await import('@/lib/shared/prisma');
    const hash = EmailChangeToken.hash(rawToken);
    return prisma.emailChangeRequest.findUnique({
      where: { tokenHash: hash },
      select: {
        id: true,
        userId: true,
        oldEmail: true,
        newEmail: true,
        expiresAt: true,
        status: true,
        appliedAt: true,
        revertibleUntil: true,
        verifiedAt: true,
      },
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

    const [{ count }] = await Promise.all([
      tx.emailChangeRequest.updateMany({
        where: { id, userId, status: 'PENDING' },
        data: {
          status: 'APPLIED',
          verifiedAt: now,
          appliedAt: now,
          revertibleUntil,
        },
      }),
      tx.user.update({
        where: { id: userId },
        data: { email: newEmail },
      }),
    ]);
    return count === 1;
  },

  // Atomically marks the request REVERTED and restores the user's email.
  async revertById(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    oldEmail: string
  ): Promise<boolean> {
    const [{ count }] = await Promise.all([
      tx.emailChangeRequest.updateMany({
        where: { id, userId, status: 'APPLIED' },
        data: { status: 'REVERTED' },
      }),
      tx.user.update({
        where: { id: userId },
        data: { email: oldEmail },
      }),
    ]);
    return count === 1;
  },
};
