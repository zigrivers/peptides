import type { CorrelationStats as Stats } from '@/lib/tracker/application/OutcomeLogService';

interface Props {
  stats: Stats;
}

function format(avg: number | null): string {
  if (avg === null) return '—';
  return avg.toFixed(2);
}

export function CorrelationStats({ stats }: Props) {
  // The grid-of-cards layout uses <div> wrappers between dl and dt/dd, which
  // is allowed by HTML5 (a div may group dt/dd pairs inside a dl). The count
  // line lives inside the dd to keep the dl content model strictly compliant.
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded border border-gray-200 bg-white p-3">
        <dt className="text-xs text-gray-500">Avg on dosed days</dt>
        <dd>
          <span className="block text-lg font-semibold text-gray-900">
            {format(stats.averageOnDosedDays)}
          </span>
          <span className="block text-xs text-gray-500">
            {stats.dosedDays} day{stats.dosedDays === 1 ? '' : 's'}
          </span>
        </dd>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <dt className="text-xs text-gray-500">Avg on non-dosed days</dt>
        <dd>
          <span className="block text-lg font-semibold text-gray-900">
            {format(stats.averageOnNotDosedDays)}
          </span>
          <span className="block text-xs text-gray-500">
            {stats.notDosedDays} day{stats.notDosedDays === 1 ? '' : 's'}
          </span>
        </dd>
      </div>
    </dl>
  );
}
