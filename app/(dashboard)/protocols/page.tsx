import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { ProtocolsClient } from './_components/ProtocolsClient';

export const metadata = {
  title: 'My Protocols | Peptides',
  description: 'Manage your peptide regimens, view benefits, side effects, and check inventory runout forecasting.',
};

export default async function ProtocolsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // Resolve actor user and all of their managed active users
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, syringeStandard: true },
  });

  if (!currentUser) redirect('/login');

  const managedUsers = await prisma.user.findMany({
    where: { managedBy: userId, status: 'ACTIVE' },
    select: { id: true, name: true, syringeStandard: true },
  });

  const allUsers = [currentUser, ...managedUsers];
  const allUserIds = allUsers.map((u) => u.id);

  // Fetch all protocols for self and managed users, including profile and citations
  const rawProtocols = await prisma.protocol.findMany({
    where: { userId: { in: allUserIds } },
    include: {
      compound: {
        include: {
          profile: {
            include: { citations: true },
          },
        },
      },
    },
    orderBy: [
      { status: 'asc' }, // ACTIVE first, then PAUSED, etc.
      { startDate: 'desc' },
    ],
  });

  // Fetch all active, reconstituted vials for tracking runout estimates
  const rawVials = await prisma.vial.findMany({
    where: {
      userId: { in: allUserIds },
      status: 'RECONSTITUTED',
    },
    select: {
      id: true,
      userId: true,
      compoundId: true,
      totalMg: true,
      bacWaterMl: true,
      remainingMg: true,
      status: true,
    },
  });

  // Map to matching client types to avoid serialization warnings
  const protocols = rawProtocols.map((p) => ({
    id: p.id,
    userId: p.userId,
    compoundId: p.compoundId,
    cycleId: p.cycleId,
    dose: {
      amount: p.dose && typeof p.dose === 'object' && 'amount' in p.dose ? (p.dose as Record<string, unknown>).amount as string : '0',
      unit: p.dose && typeof p.dose === 'object' && 'unit' in p.dose ? (p.dose as Record<string, unknown>).unit as string : 'mcg',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schedule: p.schedule as any,
    administrationRoute: p.administrationRoute,
    status: p.status as 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DEACTIVATED',
    startDate: p.startDate,
    endDate: p.endDate,
    notes: p.notes,
    compound: {
      id: p.compound.id,
      name: p.compound.name,
      slug: p.compound.slug,
      mechanismOfAction: p.compound.mechanismOfAction,
      administrationRoutes: p.compound.administrationRoutes,
      tags: p.compound.tags,
      profile: p.compound.profile
        ? {
            id: p.compound.profile.id,
            dosingLow: p.compound.profile.dosingLow,
            dosingTypical: p.compound.profile.dosingTypical,
            dosingHigh: p.compound.profile.dosingHigh,
            sideEffects: p.compound.profile.sideEffects,
            stackingNotes: p.compound.profile.stackingNotes,
            reconstitutedShelfLifeDays: p.compound.profile.reconstitutedShelfLifeDays,
            citations: p.compound.profile.citations.map((c) => ({
              id: c.id,
              title: c.title,
              url: c.url,
              doi: c.doi,
              pmid: c.pmid,
            })),
          }
        : null,
    },
  }));

  const vials = rawVials.map((v) => ({
    id: v.id,
    userId: v.userId,
    compoundId: v.compoundId,
    totalMg: v.totalMg,
    bacWaterMl: v.bacWaterMl,
    remainingMg: v.remainingMg,
    status: v.status,
  }));

  const users = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    syringeStandard: u.syringeStandard,
  }));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <ProtocolsClient
        initialProtocols={protocols}
        vials={vials}
        users={users}
        actorUserId={userId}
      />
    </main>
  );
}
