import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import {
  getVialsForUser,
  getDryVialsForUser,
  serializeVial,
  getInventorySummaryByCompound,
} from '@/lib/reconstitution/application/VialService';
import { listProtocolsForUser } from '@/lib/tracker/infrastructure/ProtocolRepo';
import { utcMidnightToday } from '@/lib/shared/date';
import { ReconstitutionClient } from './_components/ReconstitutionClient';
import { resolveSubjectUserId } from './_lib/resolveSubject';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ReconstitutionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const actorUserId = session.user.id;
  const resolvedSearchParams = await searchParams;
  const autoReconstituteCompoundId =
    typeof resolvedSearchParams.reconstitute === 'string' ? resolvedSearchParams.reconstitute : undefined;

  // Resolve + authorize the subject whose inventory we render. The actor may view a managed
  // user's inventory only; any unauthorized `?subject=` silently falls back to the actor.
  // The managed-user list is power-user-gated and also populates the subject selector.
  const isPowerUser = session.user.role === 'POWER_USER';
  const managedUsers = isPowerUser
    ? await prisma.user.findMany({
        where: { managedBy: actorUserId, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const managedUserIds = managedUsers.map((u) => u.id);

  const subjectUserId = resolveSubjectUserId(
    actorUserId,
    resolvedSearchParams.subject,
    managedUserIds
  );

  // Every subject-scoped fetch below uses subjectUserId (never actorUserId) so a caregiver
  // sees exactly the authorized subject's inventory/settings/protocols and nothing else.
  const [compounds, activeVials, dryVials, userSettings, protocols] = await Promise.all([
    listCompounds(),
    getVialsForUser(subjectUserId),
    getDryVialsForUser(subjectUserId),
    prisma.user.findUnique({
      where: { id: subjectUserId },
      select: { syringeStandard: true, syringeSize: true },
    }),
    listProtocolsForUser(prisma, subjectUserId),
  ]);

  const compoundsForPicker = compounds.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    profile: c.profile,
    administrationRoutes: c.administrationRoutes,
  }));

  const syringeStandard = (userSettings?.syringeStandard as 'U100' | 'U40') ?? 'U100';
  const syringeSize = (userSettings?.syringeSize as '0.3' | '0.5' | '1.0') ?? '1.0';

  const serializedActiveVials = activeVials.map((v) =>
    serializeVial(v, utcMidnightToday(), protocols, syringeStandard)
  );

  const serializedDryVials = dryVials.map((v) =>
    serializeVial(v, utcMidnightToday(), protocols, syringeStandard)
  );

  const inventorySummary = await getInventorySummaryByCompound(subjectUserId, protocols, syringeStandard);

  const compoundsMinimal = compounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10 animate-page-enter">
      <ReconstitutionClient
        userId={subjectUserId}
        actorUserId={actorUserId}
        managedUsers={managedUsers}
        compounds={compoundsForPicker}
        compoundsMinimal={compoundsMinimal}
        dryVials={serializedDryVials}
        activeVials={serializedActiveVials}
        inventorySummary={inventorySummary}
        syringeStandard={syringeStandard}
        syringeSize={syringeSize}
        autoReconstituteCompoundId={autoReconstituteCompoundId}
      />
    </main>
  );
}
