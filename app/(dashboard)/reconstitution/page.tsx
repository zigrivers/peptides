import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import { getVialsForUser, serializeVial } from '@/lib/reconstitution/application/VialService';
import { ReconstitutionCalculatorForm } from './_components/ReconstitutionCalculatorForm';
import { VialInventory } from './_components/VialInventory';

export default async function ReconstitutionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [compounds, vials] = await Promise.all([
    listCompounds(),
    getVialsForUser(userId),
  ]);

  const compoundsForPicker = compounds.map((c) => ({
    id: c.id,
    name: c.name,
    profile: c.profile,
  }));

  const nowUtcMidnight = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const serializedVials = vials.map((v) => serializeVial(v, nowUtcMidnight));

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reconstitution Calculator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Calculate the correct concentration and draw volume for your peptide vials.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Calculator</h2>
        <ReconstitutionCalculatorForm compounds={compoundsForPicker} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Active Vial Inventory</h2>
        <VialInventory vials={serializedVials} />
      </section>
    </main>
  );
}
