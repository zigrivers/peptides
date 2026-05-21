import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listCompounds } from '@/lib/reference/application/CompoundService';
import { getCyclesForUser } from '@/lib/tracker/application/CycleService';
import { prisma } from '@/lib/shared/prisma';
import { CreateProtocolForm } from './_components/CreateProtocolForm';

type ManagedUser = { id: string; name: string | null; email: string };

async function getManagedUsers(powerUserId: string): Promise<ManagedUser[]> {
  return prisma.user.findMany({
    where: { managedBy: powerUserId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}

async function getActiveCycles(userId: string) {
  const cycles = await getCyclesForUser(userId);
  return cycles.filter((c) => c.status === 'ACTIVE').map((c) => ({ id: c.id, name: c.name }));
}

export default async function NewProtocolPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [compounds, managedUsers, actorCycles] = await Promise.all([
    listCompounds(),
    session.user.role === 'POWER_USER'
      ? getManagedUsers(session.user.id)
      : Promise.resolve([] as ManagedUser[]),
    getActiveCycles(session.user.id),
  ]);

  // Load active cycles for each managed user so the form can show the right cycles per subject.
  const managedCycleEntries = await Promise.all(
    managedUsers.map(async (u) => [u.id, await getActiveCycles(u.id)] as const)
  );

  const cyclesByUserId: Record<string, { id: string; name: string }[]> = {
    [session.user.id]: actorCycles,
    ...Object.fromEntries(managedCycleEntries),
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">New Protocol</h1>
      <CreateProtocolForm
        compounds={compounds}
        managedUsers={managedUsers}
        currentUserId={session.user.id}
        cyclesByUserId={cyclesByUserId}
      />
    </main>
  );
}
