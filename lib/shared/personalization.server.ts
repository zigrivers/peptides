import { prisma } from './prisma';
import { withAudit } from '../audit/application/withAudit';
import { type Theme, type AccentColor } from './personalization';

class RollbackSkipAudit extends Error {
  isRollbackSkipAudit = true;
  constructor() {
    super('RollbackSkipAudit');
    this.name = 'RollbackSkipAudit';
  }
}

export async function updatePersonalizationSettings(
  userId: string,
  data: { theme: Theme; accentColor: AccentColor; clientVersion?: number }
) {
  // 1. Pre-flight check to avoid starting transactions for obviously stale writes
  // NOTE: This query is scoped to id: userId (which is the authenticated user's record),
  // and is documented as an approved scoping exception in AGENTS.md.
  const preflight = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, theme: true, accentColor: true, personalizationVersion: true }
  });
  if (!preflight) return null;

  const nextVersion = data.clientVersion ?? (preflight.personalizationVersion + 1);

  if (data.clientVersion !== undefined && preflight.personalizationVersion >= data.clientVersion) {
    return preflight;
  }

  try {
    return await withAudit(
      async (tx) => {
        const updateResult = await tx.user.updateMany({
          where: data.clientVersion !== undefined ? {
            id: userId,
            personalizationVersion: { lt: data.clientVersion }
          } : {
            id: userId
          },
          data: {
            theme: data.theme,
            accentColor: data.accentColor,
            personalizationVersion: nextVersion,
          }
        });

        if (data.clientVersion !== undefined && updateResult.count === 0) {
          // Abort the transaction to roll back the audit write if version is stale
          throw new RollbackSkipAudit();
        }

        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, theme: true, accentColor: true, personalizationVersion: true }
        });
      },
      (user) => ({
        actorUserId: userId,
        category: 'Auth' as const,
        action: 'PERSONALIZATION_UPDATED' as const,
        resourceId: userId,
        resourceType: 'User',
        newValues: {
          theme: user.theme,
          accentColor: user.accentColor,
          personalizationVersion: user.personalizationVersion,
        }
      })
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      ('isRollbackSkipAudit' in error || ('name' in error && error.name === 'RollbackSkipAudit'))
    ) {
      // Re-read outside of the rolled back transaction to get the true committed database state
      return prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, theme: true, accentColor: true, personalizationVersion: true }
      });
    }
    throw error;
  }
}
