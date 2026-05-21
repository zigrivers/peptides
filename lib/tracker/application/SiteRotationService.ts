import { prisma } from '@/lib/shared/prisma';
import { findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';
import { findRecentLogsWithSitesForCompound } from '../infrastructure/DoseLogRepo';
import { getManagedUserIds } from './ProtocolService';
import {
  getSitesForRoute,
  suggestNextSite,
  getSitesMeta,
  type SiteSuggestion,
} from '../domain/SiteRotation';
import type { InjectionSite } from '../domain/types';

export async function getSiteSuggestion(
  actorUserId: string,
  protocolId: string
): Promise<SiteSuggestion> {
  const managedIds = await getManagedUserIds(actorUserId);
  const protocol = await findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
  if (!protocol) throw new Error(`Protocol not found: ${protocolId}`);

  const validSites = getSitesForRoute(protocol.administrationRoute);

  if (validSites.length === 0) {
    return { suggestion: null, validSites: [], siteMeta: [], recentSites: [] };
  }

  const recentLogs = await findRecentLogsWithSitesForCompound(
    prisma,
    protocol.userId,
    protocol.compoundId,
    7
  );

  const recentSites = recentLogs
    .map((l) => l.injectionSite)
    .filter((s): s is InjectionSite => s !== null);

  const suggestion = suggestNextSite(recentSites, validSites);
  const siteMeta = getSitesMeta(recentLogs, validSites, new Date());

  return { suggestion, validSites, siteMeta, recentSites };
}
