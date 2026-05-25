import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { CreateVendorForm } from './_components/CreateVendorForm';

export default async function NewVendorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 animate-page-enter">
      <div className="mb-6">
        <Link href="/ordering" className="text-sm text-primary hover:underline">
          ← Back to Vendors
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">Add Vendor</h1>
      </div>

      <section className="rounded-xl border border-border bg-card text-card-foreground px-6 py-6 shadow-sm">
        <CreateVendorForm />
      </section>
    </main>
  );
}
