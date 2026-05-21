'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCycleAction } from '@/app/actions/tracker/cycle';

export function CreateCycleForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name') as string;
    const startDate = fd.get('startDate') as string;
    const endDate = (fd.get('endDate') as string) || undefined;

    startTransition(async () => {
      const result = await createCycleAction({ name, startDate, endDate });
      if (result.ok) {
        router.push('/tracker/cycles');
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. Summer 2026"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="startDate">
          Start date
        </label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="endDate">
          End date <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          Create Cycle
        </button>
      </div>
    </form>
  );
}
