import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import { getVialsForUser, serializeVial } from '@/lib/reconstitution/application/VialService';
import { listProtocolsForUser } from '@/lib/tracker/infrastructure/ProtocolRepo';
import { utcMidnightToday } from '@/lib/shared/date';
import { ReconstitutionCalculatorForm } from './_components/ReconstitutionCalculatorForm';
import { VialInventory } from './_components/VialInventory';

export default async function ReconstitutionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [compounds, vials, userSettings, protocols] = await Promise.all([
    listCompounds(),
    getVialsForUser(userId),
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

  const syringeStandard = userSettings?.syringeStandard ?? 'U100';
  const serializedVials = vials.map((v) => serializeVial(v, utcMidnightToday(), protocols, syringeStandard));

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10 animate-page-enter">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Reconstitution Calculator</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Calculate the correct concentration and draw volume for your peptide vials.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card text-card-foreground px-6 py-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground/90 mb-5">Calculator</h2>
        <ReconstitutionCalculatorForm
          compounds={compoundsForPicker}
          initialSyringeStandard={(userSettings?.syringeStandard as 'U100' | 'U40') ?? 'U100'}
          initialSyringeSize={(userSettings?.syringeSize as '0.3' | '0.5' | '1.0') ?? '1.0'}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground/90 mb-3">Active Vial Inventory</h2>
        <VialInventory vials={serializedVials} />
      </section>
    </main>
  );
}
