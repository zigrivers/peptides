import { prisma } from '@/lib/shared/prisma';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export const PasswordResetRepo = {
  async create(tx: TxClient, userId: string): Promise<string> {
    const { rawToken, tokenHash } = PasswordResetToken.generate();
    const expiresAt = PasswordResetToken.expiry();
    await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    return rawToken;
  },

  async findByRawToken(rawToken: string) {
    const tokenHash = PasswordResetToken.hash(rawToken);
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  async markUsed(tx: TxClient, id: string): Promise<void> {
    await tx.passwordResetToken.update({ where: { id }, data: { used: true } });
  },
};
