import React from 'react';
import { CalendarDays, Clock3, Gauge, MapPin, RotateCcw, Route } from 'lucide-react';
import type { DoseAmount } from '@/lib/reference/domain/types';

type DoseTier = {
  key: 'low' | 'typical' | 'high';
  label: string;
  eyebrow: string;
  dose: DoseAmount | null | undefined;
};

type DosingGuidanceRangesProps = {
  ranges: {
    low?: DoseAmount | null;
    typical?: DoseAmount | null;
    high?: DoseAmount | null;
  };
};

const TIERS: Omit<DoseTier, 'dose'>[] = [
  { key: 'low', label: 'Conservative', eyebrow: 'Lower exposure' },
  { key: 'typical', label: 'Typical Range', eyebrow: 'Common reference' },
  { key: 'high', label: 'Aggressive', eyebrow: 'Upper exposure' },
];

function DoseRangeCard({ tier }: { tier: DoseTier }) {
  if (!tier.dose) return null;

  const isTypical = tier.key === 'typical';

  return (
    <article
      className={`rounded-lg border p-4 ${
        isTypical
          ? 'border-primary/40 bg-primary/[0.06] shadow-sm'
          : 'border-border bg-background/60'
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tier.eyebrow}
          </p>
          <h3 className={`mt-1 text-sm font-bold ${isTypical ? 'text-primary' : 'text-foreground'}`}>
            {tier.label}
          </h3>
        </div>
        {isTypical && (
          <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            Reference
          </span>
        )}
      </div>

      <p className="mt-4 text-2xl font-black text-foreground tabular-nums">
        {tier.dose.amount} <span className="text-base font-bold text-muted-foreground">{tier.dose.unit}</span>
      </p>

      {(tier.dose.recommendedFrequency || tier.dose.researchBenefits) && (
        <div className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {tier.dose.recommendedFrequency && tier.dose.recommendedFrequency !== 'N/A' && (
            <p>
              <span className="font-semibold text-foreground">Frequency:</span>{' '}
              {tier.dose.recommendedFrequency}
            </p>
          )}
          {tier.dose.researchBenefits && (
            <p>
              <span className="font-semibold text-foreground">Benefits:</span>{' '}
              {tier.dose.researchBenefits}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function DosingGuidanceRanges({ ranges }: DosingGuidanceRangesProps) {
  const tiers = TIERS.map((tier) => ({
    ...tier,
    dose:
      tier.key === 'low'
        ? ranges.low
        : tier.key === 'typical'
        ? ranges.typical
        : ranges.high,
  }));

  if (!tiers.some((tier) => tier.dose)) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
      aria-labelledby="dosing-guidance-ranges"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dose Planning</p>
          <h2 id="dosing-guidance-ranges" className="mt-1 text-lg font-bold text-foreground text-pretty">
            Dosing Guidance Ranges
          </h2>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {tiers.map((tier) => (
          <DoseRangeCard key={tier.key} tier={tier} />
        ))}
      </div>
    </section>
  );
}

type ProtocolSummaryGridProps = {
  cycleLabel?: string | null;
  scheduleLabel?: string | null;
  restLabel?: string | null;
  preferredTimeLabel?: string | null;
  routes?: string[];
};

const protocolItems = [
  { key: 'scheduleLabel', label: 'Schedule', icon: CalendarDays },
  { key: 'cycleLabel', label: 'Cycle', icon: Gauge },
  { key: 'restLabel', label: 'Rest', icon: RotateCcw },
  { key: 'preferredTimeLabel', label: 'Timing', icon: Clock3 },
] as const;

export function ProtocolSummaryGrid({
  cycleLabel,
  scheduleLabel,
  restLabel,
  preferredTimeLabel,
  routes = [],
}: ProtocolSummaryGridProps) {
  const values = {
    cycleLabel: cycleLabel || 'Continuous',
    scheduleLabel: scheduleLabel || 'Not specified',
    restLabel: restLabel || 'N/A',
    preferredTimeLabel: preferredTimeLabel || 'N/A',
  };
  const routeLabel = routes.length > 0 ? routes.join(', ') : 'Not specified';

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
      aria-labelledby="protocol-snapshot"
    >
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="protocol-snapshot" className="text-lg font-bold text-foreground text-pretty">
          Protocol Snapshot
        </h2>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {protocolItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="min-w-0 bg-background p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {item.label}
              </dt>
              <dd className="mt-2 break-words text-sm font-bold leading-snug text-foreground">
                {values[item.key]}
              </dd>
            </div>
          );
        })}
        <div className="min-w-0 bg-background p-4">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Route
          </dt>
          <dd className="mt-2 break-words text-sm font-bold leading-snug text-foreground">{routeLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
