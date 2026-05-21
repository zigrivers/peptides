import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getVendorById } from '@/lib/ordering/application/VendorService';
import { listVendorProducts } from '@/lib/ordering/application/VendorProductService';
import { listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import { AddProductForm } from './_components/AddProductForm';
import { ProductList } from './_components/ProductList';
import { VendorStatusBadge } from '../_components/VendorStatusBadge';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;
  const [vendor, products, compounds] = await Promise.all([
    getVendorById(session.user.id, id),
    listVendorProducts(session.user.id, id),
    listCompounds(),
  ]);

  if (!vendor) notFound();

  const compoundsForPicker = compounds.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <Link href="/ordering" className="text-sm text-indigo-600 hover:underline">
          ← Back to Vendors
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{vendor.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">@{vendor.telegramUsername} · {vendor.preferredCurrency}</p>
          </div>
          <div className="mt-1">
            <VendorStatusBadge status={vendor.status} />
          </div>
        </div>
      </div>

      {vendor.messageTemplate && (
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Message Template</p>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{vendor.messageTemplate}</pre>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Catalog Products</h2>
          {vendor.status === 'ACTIVE' && (
            <AddProductForm vendorId={vendor.id} compounds={compoundsForPicker} />
          )}
        </div>
        <ProductList products={products} vendorId={vendor.id} />
      </section>
    </main>
  );
}
