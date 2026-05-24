'use client';

import React from 'react';
import type { WarningType } from '@/lib/reconstitution/domain/WarningPolicy';

interface Props {
  units: number;
  warnings: WarningType[];
}

// Static tick arrays defined once outside render loop to avoid allocation overhead (F-001)
const MAJOR_TICKS = Array.from({ length: 11 }, (_, i) => i * 10);
const MINOR_TICKS = Array.from({ length: 20 }, (_, i) => i * 5).filter(
  (val) => val % 10 !== 0
);

export function SyringePreview({ units, warnings }: Props) {
  // Determine color theme based on warnings (F-002)
  const hasDestructive = warnings.includes('EXCEEDS_VIAL_CAPACITY') || units > 100;
  const hasWarning =
    warnings.includes('HIGH_VOLUME') ||
    warnings.includes('LOW_BAC_VOLUME') ||
    warnings.includes('ABOVE_REFERENCE_RANGE');

  let fluidColorClass = 'fill-primary/30 stroke-primary';
  let labelColorClass = 'text-primary';

  if (hasDestructive) {
    fluidColorClass = 'fill-destructive/40 stroke-destructive';
    labelColorClass = 'text-destructive';
  } else if (hasWarning) {
    fluidColorClass = 'fill-warning/40 stroke-warning';
    labelColorClass = 'text-warning';
  }

  // Syringe scale math (0 - 100 units mapped to 0 - 180px in vertical space)
  const MAX_UNITS = 100;
  const BARREL_TOP_Y = 30;
  const BARREL_BOTTOM_Y = 210;
  const BARREL_HEIGHT = BARREL_BOTTOM_Y - BARREL_TOP_Y; // 180

  const clampedUnits = Math.min(MAX_UNITS, Math.max(0, units));
  const fluidHeight = (clampedUnits / MAX_UNITS) * BARREL_HEIGHT;
  const stopperY = BARREL_TOP_Y + fluidHeight;

  // The plunger rod has a constant physical length and moves dynamically (F-001)
  const PLUNGER_SHAFT_LENGTH = 180;

  return (
    <div className="w-full flex flex-col items-center select-none">
      <p className="text-[10px] font-semibold text-muted-foreground tracking-wider mb-1">
        SYRINGE PREVIEW
      </p>
      <div className={`text-xs font-bold font-mono mb-2 text-center ${labelColorClass}`}>
        {units.toFixed(1)} U
        {units > 100 && (
          <span className="block text-[9px] font-semibold text-destructive mt-0.5 animate-pulse">
            (max 100 U capacity)
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 120 410"
        className="w-full h-full max-h-[300px]"
        role="img"
        aria-label={`Visual syringe showing ${units.toFixed(1)} units filled.`}
      >
        {/* Needle */}
        <line
          x1="60"
          y1="5"
          x2="60"
          y2="20"
          className="stroke-muted-foreground/80"
          strokeWidth="1"
        />

        {/* Needle Hub */}
        <polygon
          points="56,20 64,20 62,30 58,30"
          className="fill-muted stroke-border"
          strokeWidth="1"
        />

        {/* Plunger Shaft (behind fluid fill but inside barrel) */}
        <rect
          x="58"
          y={stopperY + 4}
          width="4"
          height={PLUNGER_SHAFT_LENGTH}
          className="fill-muted-foreground/20 stroke-muted-foreground/30"
          strokeWidth="0.5"
        />
        {/* Plunger Flange (Thumb Rest) */}
        <ellipse
          cx="60"
          cy={stopperY + 4 + PLUNGER_SHAFT_LENGTH}
          rx="12"
          ry="3"
          className="fill-muted-foreground/30 stroke-muted-foreground/50"
          strokeWidth="0.75"
        />

        {/* Fluid Fill */}
        {fluidHeight > 0 && (
          <rect
            x="48"
            y={BARREL_TOP_Y}
            width="24"
            height={fluidHeight}
            className={fluidColorClass}
            strokeWidth="0"
          />
        )}

        {/* Rubber Stopper (Plunger Seal) */}
        <g>
          {/* Stopper body */}
          <rect
            x="48"
            y={stopperY - 2}
            width="24"
            height="6"
            className="fill-slate-800 dark:fill-slate-200"
            rx="1"
          />
          {/* Stopper top dome */}
          <path
            d={`M 48,${stopperY - 2} C 48,${stopperY - 4} 72,${stopperY - 4} 72,${stopperY - 2} Z`}
            className="fill-slate-800 dark:fill-slate-200"
          />
        </g>

        {/* Barrel Outer Outline */}
        <rect
          x="48"
          y={BARREL_TOP_Y}
          width="24"
          height={BARREL_HEIGHT}
          className="fill-transparent stroke-border"
          strokeWidth="1.5"
          rx="1"
        />

        {/* Barrel Flanges (Finger Grips) */}
        <path
          d="M 38,210 L 82,210 A 4,4 0 0,1 82,214 L 38,214 A 4,4 0 0,1 38,210 Z"
          className="fill-muted stroke-border"
          strokeWidth="1"
        />

        {/* Scale Ticks (Left Side of Barrel) */}
        <g className="pointer-events-none">
          {/* Major Ticks (0, 10, 20...100) */}
          {MAJOR_TICKS.map((val) => {
            const tickY = BARREL_TOP_Y + (val / MAX_UNITS) * BARREL_HEIGHT;
            return (
              <g key={`major-${val}`}>
                <line
                  x1="48"
                  y1={tickY}
                  x2="53"
                  y2={tickY}
                  className="stroke-foreground/60"
                  strokeWidth="1"
                />
                <text
                  x="44"
                  y={tickY + 2.5}
                  className="text-[6.5px] font-mono fill-muted-foreground font-semibold"
                  textAnchor="end"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Minor Ticks (5, 15, 25...) */}
          {MINOR_TICKS.map((val) => {
            const tickY = BARREL_TOP_Y + (val / MAX_UNITS) * BARREL_HEIGHT;
            return (
              <line
                key={`minor-${val}`}
                x1="48"
                y1={tickY}
                x2="51"
                y2={tickY}
                className="stroke-foreground/30"
                strokeWidth="0.75"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
