import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listCompounds } from '@/lib/reference/application/CompoundService';
import { getCyclesForUser } from '@/lib/tracker/application/CycleService';
import { prisma } from '@/lib/shared/prisma';
import { CreateProtocolForm } from './_components/CreateProtocolForm';

type ManagedUser = { id: string; name: string | null; email: string; syringeStandard: string };

async function getManagedUsers(powerUserId: string): Promise<ManagedUser[]> {
  return prisma.user.findMany({
    where: { managedBy: powerUserId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true, syringeStandard: true },
    orderBy: { name: 'asc' },
  });
}

async function getActiveCycles(userId: string) {
  const cycles = await getCyclesForUser(userId);
  return cycles.filter((c) => c.status === 'ACTIVE').map((c) => ({ id: c.id, name: c.name }));
}

export default async function NewProtocolPage({
  searchParams,
}: {
  searchParams: { cloneFrom?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [compounds, currentUser, managedUsers, actorCycles, cloneSource] = await Promise.all([
    listCompounds(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, syringeStandard: true },
    }),
    session.user.role === 'POWER_USER'
      ? getManagedUsers(session.user.id)
      : Promise.resolve([] as ManagedUser[]),
    getActiveCycles(session.user.id),
    searchParams.cloneFrom
      ? prisma.protocol.findUnique({
          where: { id: searchParams.cloneFrom },
          select: {
            id: true,
            userId: true,
            compoundId: true,
            dose: true,
            schedule: true,
            administrationRoute: true,
            notes: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!currentUser) redirect('/login');

  const serializedCurrentUser = {
    id: currentUser.id,
    name: currentUser.name ?? 'Me',
    email: '',
    syringeStandard: currentUser.syringeStandard,
  };

  // Load active cycles for each managed user so the form can show the right cycles per subject.
  const managedCycleEntries = await Promise.all(
    managedUsers.map(async (u) => [u.id, await getActiveCycles(u.id)] as const)
  );

  const cyclesByUserId: Record<string, { id: string; name: string }[]> = {
    [session.user.id]: actorCycles,
    ...Object.fromEntries(managedCycleEntries),
  };

  const serializedCloneSource = cloneSource
    ? {
        ...cloneSource,
        dose: {
          amount: (cloneSource.dose as Record<string, unknown>).amount as string,
          unit: (cloneSource.dose as Record<string, unknown>).unit as string,
        },
        schedule: cloneSource.schedule,
      }
    : undefined;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <CreateProtocolForm
        compounds={compounds}
        managedUsers={managedUsers}
        currentUser={serializedCurrentUser}
        cyclesByUserId={cyclesByUserId}
        cloneSource={serializedCloneSource}
      />
    </main>
  );
}
