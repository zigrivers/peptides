'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Protocol } from '@/lib/tracker/domain/types';
import {
  pauseProtocolAction,
  resumeProtocolAction,
  deactivateProtocolAction,
  cloneProtocolAction,
} from '@/app/actions/tracker/protocol-lifecycle';

type Props = { protocol: Protocol };

export function ProtocolActions({ protocol }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneDate, setCloneDate] = useState('');

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string; protocolId?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        router.push('/tracker');
        router.refresh();
      } else {
        setError(result.message ?? result.error ?? 'Unknown error');
      }
    });
  }

  const { status, id } = protocol;
  const isTerminal = status === 'DEACTIVATED';

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {status === 'ACTIVE' && (
          <button
            disabled={isPending}
            onClick={() => run(() => pauseProtocolAction({ protocolId: id }))}
            className="rounded-md border border-yellow-400 text-yellow-700 bg-yellow-50 px-4 py-2 text-sm font-medium hover:bg-yellow-100 disabled:opacity-60 transition-colors"
          >
            Pause
          </button>
        )}

        {status === 'PAUSED' && (
          <button
            disabled={isPending}
            onClick={() => run(() => resumeProtocolAction({ protocolId: id }))}
            className="rounded-md border border-green-400 text-green-700 bg-green-50 px-4 py-2 text-sm font-medium hover:bg-green-100 disabled:opacity-60 transition-colors"
          >
            Resume
          </button>
        )}

        {!isTerminal && (
          <button
            disabled={isPending}
            onClick={() => setShowCloneForm((v) => !v)}
            className="rounded-md border border-indigo-400 text-indigo-700 bg-indigo-50 px-4 py-2 text-sm font-medium hover:bg-indigo-100 disabled:opacity-60 transition-colors"
          >
            Clone
          </button>
        )}

        {!isTerminal && (
          <button
            disabled={isPending}
            onClick={() => {
              if (confirm('Deactivate this protocol? This cannot be undone.')) {
                run(() => deactivateProtocolAction({ protocolId: id }));
              }
            }}
            className="rounded-md border border-red-300 text-red-700 bg-red-50 px-4 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-60 transition-colors"
          >
            Deactivate
          </button>
        )}
      </div>

      {showCloneForm && (
        <div className="rounded-md border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Clone to new start date</p>
          <input
            type="date"
            value={cloneDate}
            onChange={(e) => setCloneDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              disabled={isPending || !cloneDate}
              onClick={() =>
                run(() =>
                  cloneProtocolAction({ protocolId: id, newStartDate: new Date(cloneDate) })
                )
              }
              className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              Confirm Clone
            </button>
            <button
              onClick={() => setShowCloneForm(false)}
              className="rounded-md border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
