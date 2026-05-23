import type { CorrelationStats as Stats } from '@/lib/tracker/application/OutcomeLogService';

interface Props {
  stats: Stats;
}

function format(avg: number | null): string {
  if (avg === null) return '—';
  return avg.toFixed(2);
}

export function CorrelationStats({ stats }: Props) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded border border-gray-200 bg-white p-3">
        <dt className="text-xs text-gray-500">Avg on dosed days</dt>
        <dd className="text-lg font-semibold text-gray-900">{format(stats.averageOnDosedDays)}</dd>
        <p className="text-xs text-gray-500">{stats.dosedDays} day{stats.dosedDays === 1 ? '' : 's'}</p>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <dt className="text-xs text-gray-500">Avg on non-dosed days</dt>
        <dd className="text-lg font-semibold text-gray-900">{format(stats.averageOnNotDosedDays)}</dd>
        <p className="text-xs text-gray-500">
          {stats.notDosedDays} day{stats.notDosedDays === 1 ? '' : 's'}
        </p>
      </div>
    </dl>
  );
}
