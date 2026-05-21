import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listCompounds } from '@/lib/reference/application/CompoundService';
import { getCyclesForUser } from '@/lib/tracker/application/CycleService';
import { prisma } from '@/lib/shared/prisma';
import { CreateProtocolForm } from './_components/CreateProtocolForm';

async function getManagedUsers(powerUserId: string) {
  return prisma.user.findMany({
    where: { managedBy: powerUserId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}

export default async function NewProtocolPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [compounds, managedUsers, cycles] = await Promise.all([
    listCompounds(),
    session.user.role === 'POWER_USER'
      ? getManagedUsers(session.user.id)
      : Promise.resolve([]),
    getCyclesForUser(session.user.id),
  ]);

  const activeCycles = cycles.filter((c) => c.status === 'ACTIVE').map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">New Protocol</h1>
      <CreateProtocolForm
        compounds={compounds}
        managedUsers={managedUsers}
        currentUserId={session.user.id}
        cycles={activeCycles}
      />
    </main>
  );
}
