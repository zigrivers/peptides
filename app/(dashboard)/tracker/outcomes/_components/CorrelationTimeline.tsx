import type { TimelineBucket } from '@/lib/tracker/application/OutcomeLogService';

interface Props {
  buckets: TimelineBucket[];
}

const CHART_HEIGHT = 160;
const BAR_AREA_HEIGHT = 110; // upper portion = dose-event bars
const LINE_AREA_HEIGHT = 50;  // lower portion = outcome rating line
const RATING_MAX = 5;

/**
 * Pure-SVG correlation timeline. Dose events render as bars (top axis),
 * outcome ratings as a connected line (bottom axis). No JS needed at
 * runtime — the chart is server-rendered.
 *
 * Accessibility: the chart is rendered alongside a screen-reader-only
 * data table (US-ANL-01 AC-7).
 */
export function CorrelationTimeline({ buckets }: Props) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No data yet — log a dose and rate today&apos;s outcome to start the timeline.
      </p>
    );
  }

  const maxDoses = Math.max(1, ...buckets.map((b) => b.doseEvents));
  const width = 100; // viewBox width in %
  const barWidth = width / buckets.length;

  const ratingPoints = buckets
    .map((b, i) => {
      if (b.outcomeRating === null) return null;
      const x = i * barWidth + barWidth / 2;
      const yNorm = b.outcomeRating / RATING_MAX;
      const y = BAR_AREA_HEIGHT + (LINE_AREA_HEIGHT - yNorm * LINE_AREA_HEIGHT);
      return { x, y, raw: b.outcomeRating, date: b.date };
    })
    .filter((p): p is { x: number; y: number; raw: number; date: string } => p !== null);

  const polylinePoints = ratingPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Dose events and outcome rating for the past ${buckets.length} days`}
        className="w-full h-40 border border-border rounded bg-card"
      >
        {/*
          `preserveAspectRatio="none"` lets the chart stretch responsively to
          the container width but would otherwise distort stroked geometry
          (line thickness, circle aspect). `vector-effect: non-scaling-stroke`
          on stroked shapes keeps the line widths uniform, and the data-point
          circles are rendered as small ellipses-by-design to share the
          stretching with the polyline.
        */}
        {/* Dose-event bars */}
        {buckets.map((b, i) => {
          const x = i * barWidth;
          const barH = (b.doseEvents / maxDoses) * BAR_AREA_HEIGHT;
          const y = BAR_AREA_HEIGHT - barH;
          return (
            <rect
              key={`bar-${b.date}`}
              x={x + barWidth * 0.1}
              y={y}
              width={barWidth * 0.8}
              height={barH}
              className={b.doseEvents > 0 ? 'fill-primary' : 'fill-transparent'}
            />
          );
        })}
        {/* Divider between bar area and line area */}
        <line
          x1={0}
          y1={BAR_AREA_HEIGHT}
          x2={width}
          y2={BAR_AREA_HEIGHT}
          className="stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* Outcome rating line */}
        {ratingPoints.length > 1 && (
          <polyline
            points={polylinePoints}
            className="stroke-success fill-none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {ratingPoints.map((p) => (
          <circle key={`pt-${p.date}`} cx={p.x} cy={p.y} r={0.6} className="fill-success" />
        ))}
      </svg>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show data table
        </summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-3">Date</th>
              <th className="py-1 pr-3">Doses logged</th>
              <th className="py-1">Outcome (1-5)</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.date} className="border-t border-border">
                <td className="py-1 pr-3 text-foreground">{b.date}</td>
                <td className="py-1 pr-3 text-foreground">{b.doseEvents}</td>
                <td className="py-1 text-foreground">{b.outcomeRating ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
