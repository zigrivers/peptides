import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';

const GLOBAL_ID = 'global';

export interface BriefingData {
  summary: string;
  findings: Prisma.InputJsonValue;
  sourcesUsed: Prisma.InputJsonValue;
  updatedByUserId: string;
}

export const FdaBriefingRepo = {
  getGlobal() {
    return prisma.fdaBriefing.findUnique({ where: { id: GLOBAL_ID } });
  },
  upsertGlobal(tx: Prisma.TransactionClient, data: BriefingData) {
    return tx.fdaBriefing.upsert({
      where: { id: GLOBAL_ID },
      create: { id: GLOBAL_ID, ...data },
      update: { ...data },
    });
  },
};
