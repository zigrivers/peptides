'use client';

import type { VialWithBadges, VialBadge } from '@/lib/reconstitution/application/VialService';

interface Props {
  vials: VialWithBadges[];
}

const BADGE_STYLES: Record<VialBadge, string> = {
  EXPIRED: 'bg-red-50 text-red-700 border-red-200',
  EXPIRING_SOON: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW_INVENTORY: 'bg-orange-50 text-orange-700 border-orange-200',
};

const BADGE_LABELS: Record<VialBadge, string> = {
  EXPIRED: 'Expired',
  EXPIRING_SOON: 'Expiring soon',
  LOW_INVENTORY: 'Low inventory',
};

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}

export function VialInventory({ vials }: Props) {
  if (vials.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        No active vials. Use the calculator above to reconstitute your first vial.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {vials.map((vial) => (
        <li
          key={vial.id}
          className="rounded-lg border border-gray-200 px-4 py-3 bg-white"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-gray-900 text-sm">{vial.compoundName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {vial.remainingMg.toFixed(2)} mg remaining of {vial.totalMg.toFixed(2)} mg
                {vial.bacWaterMl && (
                  <> &middot; {vial.bacWaterMl.toFixed(1)} mL BAC water</>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Expires {formatDate(vial.expiresAt)}
              </p>
            </div>
            {vial.badges.length > 0 && (
              <div className="flex flex-col gap-1 items-end">
                {vial.badges.map((badge) => (
                  <span
                    key={badge}
                    className={`text-xs rounded-full px-2 py-0.5 border font-medium whitespace-nowrap ${BADGE_STYLES[badge]}`}
                  >
                    {BADGE_LABELS[badge]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
