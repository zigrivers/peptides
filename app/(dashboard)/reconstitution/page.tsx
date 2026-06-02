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

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ReconstitutionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const resolvedSearchParams = await searchParams;
  const autoReconstituteCompoundId =
    typeof resolvedSearchParams.reconstitute === 'string' ? resolvedSearchParams.reconstitute : undefined;

  const [compounds, activeVials, dryVials, userSettings, protocols] = await Promise.all([
    listCompounds(),
    getVialsForUser(userId),
    getDryVialsForUser(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { syringeStandard: true, syringeSize: true },
    }),
    listProtocolsForUser(prisma, userId),
  ]);

  const compoundsForPicker = compounds.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    profile: c.profile,
  }));

  const syringeStandard = (userSettings?.syringeStandard as 'U100' | 'U40') ?? 'U100';
  const syringeSize = (userSettings?.syringeSize as '0.3' | '0.5' | '1.0') ?? '1.0';

  const serializedActiveVials = activeVials.map((v) =>
    serializeVial(v, utcMidnightToday(), protocols, syringeStandard)
  );

  const serializedDryVials = dryVials.map((v) =>
    serializeVial(v, utcMidnightToday(), protocols, syringeStandard)
  );

  const inventorySummary = await getInventorySummaryByCompound(userId, protocols, syringeStandard);

  // Reconstituted vials grouped by compound — drives the per-compound "drawing from" selector.
  const reconstitutedVialsByCompound = serializedActiveVials.reduce<
    Record<string, typeof serializedActiveVials>
  >((acc, v) => {
    (acc[v.compoundId] ??= []).push(v);
    return acc;
  }, {});

  const compoundsMinimal = compounds.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10 animate-page-enter">
      <ReconstitutionClient
        userId={userId}
        compounds={compoundsForPicker}
        compoundsMinimal={compoundsMinimal}
        dryVials={serializedDryVials}
        activeVials={serializedActiveVials}
        inventorySummary={inventorySummary}
        reconstitutedVialsByCompound={reconstitutedVialsByCompound}
        syringeStandard={syringeStandard}
        syringeSize={syringeSize}
        autoReconstituteCompoundId={autoReconstituteCompoundId}
      />
    </main>
  );
}
