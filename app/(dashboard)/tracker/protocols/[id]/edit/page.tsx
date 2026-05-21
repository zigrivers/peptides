import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getProtocolById } from '@/lib/tracker/application/ProtocolService';
import { EditProtocolForm } from './_components/EditProtocolForm';

export default async function EditProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;
  const protocol = await getProtocolById(id, session.user.id);
  if (!protocol) notFound();

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Protocol</h1>
      <EditProtocolForm protocol={protocol} />
    </main>
  );
}
