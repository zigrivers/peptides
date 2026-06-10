import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { CreateCycleForm } from './_components/CreateCycleForm';

export default async function NewCyclePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/tracker/cycles"
          className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          ← Cycles
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">New Cycle</h1>
      <CreateCycleForm />
    </main>
  );
}
