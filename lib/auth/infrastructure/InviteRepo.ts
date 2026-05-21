import { prisma } from '@/lib/shared/prisma';

interface CreateInviteInput {
  email: string;
  powerUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { invite: any };

export const InviteRepo = {
  async create(tx: Tx, input: CreateInviteInput) {
    return tx.invite.create({
      data: {
        email: input.email,
        powerUserId: input.powerUserId,
        tokenHash: input.tokenHash,
        status: 'PENDING',
        expiresAt: input.expiresAt,
      },
    });
  },

  async findByTokenHash(tokenHash: string) {
    return prisma.invite.findFirst({ where: { tokenHash } });
  },

  async findById(id: string, powerUserId: string) {
    return prisma.invite.findFirst({ where: { id, powerUserId } });
  },

  async findPendingByEmail(email: string) {
    return prisma.invite.findFirst({ where: { email, status: 'PENDING' } });
  },

  async revokeById(tx: Tx, id: string, powerUserId: string) {
    return tx.invite.updateMany({ where: { id, powerUserId }, data: { status: 'REVOKED' } });
  },
};
