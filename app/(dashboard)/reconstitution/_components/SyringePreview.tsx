'use client';

import React, { useRef, useState } from 'react';
import type { WarningType } from '@/lib/reconstitution/domain/WarningPolicy';
import { getAudioPlayer } from '@/lib/reconstitution/domain/audioSynth';

interface Props {
  units: number;
  warnings: WarningType[];
  syringeStandard?: 'U100' | 'U40';
  syringeSize?: '0.3' | '0.5' | '1.0';
  onChangeUnits?: (units: number) => void;
}

function getMaxUnits(standard: 'U100' | 'U40', capacityMl: '0.3' | '0.5' | '1.0'): number {
  if (standard === 'U100') {
    if (capacityMl === '0.3') return 30;
    if (capacityMl === '0.5') return 50;
    return 100;
  } else {
    if (capacityMl === '0.3') return 12;
    if (capacityMl === '0.5') return 20;
    return 40;
  }
}

function getTicks(capacityUnits: number): { major: number[]; minor: number[] } {
  const major: number[] = [];
  const minor: number[] = [];

  let majorInterval = 10;
  let minorInterval = 5;

  if (capacityUnits === 100) {
    majorInterval = 10;
    minorInterval = 5;
  } else if (capacityUnits === 50) {
    majorInterval = 5;
    minorInterval = 1;
  } else if (capacityUnits === 30) {
    majorInterval = 5;
    minorInterval = 1;
  } else if (capacityUnits === 40) {
    majorInterval = 5;
    minorInterval = 1;
  } else if (capacityUnits === 20) {
    majorInterval = 2;
    minorInterval = 1;
  } else if (capacityUnits === 12) {
    majorInterval = 2;
    minorInterval = 1;
  }

  for (let i = 0; i <= capacityUnits; i += minorInterval) {
    if (i % majorInterval === 0) {
      major.push(i);
    } else {
      minor.push(i);
    }
  }

  return { major, minor };
}

export function SyringePreview({
  units,
  warnings,
  syringeStandard = 'U100',
  syringeSize = '1.0',
  onChangeUnits,
}: Props) {
  const MAX_UNITS = getMaxUnits(syringeStandard, syringeSize);
  const { major: MAJOR_TICKS, minor: MINOR_TICKS } = getTicks(MAX_UNITS);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragUnits, setDragUnits] = useState<number | null>(null);
  const lastSoundTimeRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  // Determine color theme based on warnings
  const hasDestructive = warnings.includes('EXCEEDS_VIAL_CAPACITY') || units > MAX_UNITS;
  const hasWarning =
    warnings.includes('HIGH_VOLUME') ||
    warnings.includes('LOW_BAC_VOLUME') ||
    warnings.includes('ABOVE_REFERENCE_RANGE');

  let fluidColorClass = 'fill-primary/30 stroke-primary';

  if (hasDestructive) {
    fluidColorClass = 'fill-destructive/40 stroke-destructive';
  } else if (hasWarning) {
    fluidColorClass = 'fill-warning/40 stroke-warning animate-pulse';
  }

  // Syringe scale math (0 - MAX_UNITS mapped to 0 - 180px in vertical space)
  const BARREL_TOP_Y = 30;
  const BARREL_BOTTOM_Y = 210;
  const BARREL_HEIGHT = BARREL_BOTTOM_Y - BARREL_TOP_Y; // 180

  const displayUnits = isDragging && dragUnits !== null ? dragUnits : Math.min(MAX_UNITS, Math.max(0, units));
  const fluidHeight = (displayUnits / MAX_UNITS) * BARREL_HEIGHT;

  // The plunger rod has a constant physical length and moves dynamically
  const PLUNGER_SHAFT_LENGTH = 180;

  // Volume in mL: Use unclamped units to show the actual required dose volume even if it exceeds syringe capacity
  const volumeUnits = isDragging && dragUnits !== null ? dragUnits : Math.max(0, units);
  const volumeMl = (volumeUnits / (syringeStandard === 'U100' ? 100 : 40)).toFixed(3);

  const triggerTickSound = (newUnitsValue: number) => {
    const isMuted =
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage.getItem('peptides_sound_effects_enabled') === 'false';
    if (!isMuted) {
      const now = Date.now();
      if (now - lastSoundTimeRef.current >= 50) {
        const frequency = 400 + (newUnitsValue / MAX_UNITS) * 550;
        getAudioPlayer().playTickClick(frequency);
        lastSoundTimeRef.current = now;
      }
    }
  };

  // Drag interaction logic
  const updateVolumeFromPointer = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeY = e.clientY - rect.top;
    const viewBoxY = (relativeY / rect.height) * 410;
    const percentage = (viewBoxY - BARREL_TOP_Y) / BARREL_HEIGHT;
    const calculatedUnits = percentage * MAX_UNITS;
    const clamped = Math.max(0, Math.min(MAX_UNITS, calculatedUnits));

    setDragUnits(clamped);

    const currentTick = Math.round(clamped * 2);
    if (currentTick !== lastTickRef.current) {
      triggerTickSound(clamped);
      lastTickRef.current = currentTick;
    }
    onChangeUnits?.(clamped);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onChangeUnits) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    lastTickRef.current = Math.round(units * 2);
    updateVolumeFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateVolumeFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    setDragUnits(null);
    lastTickRef.current = null;
  };

  // Keyboard accessibility slider support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onChangeUnits) return;
    let delta = 0;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        delta = 0.5;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        delta = -0.5;
        break;
      case 'PageUp':
        delta = 5.0;
        break;
      case 'PageDown':
        delta = -5.0;
        break;
      case 'Home':
        onChangeUnits(0);
        triggerTickSound(0);
        e.preventDefault();
        return;
      case 'End':
        onChangeUnits(MAX_UNITS);
        triggerTickSound(MAX_UNITS);
        e.preventDefault();
        return;
      default:
        return; // ignore other keys
    }

    e.preventDefault();
    const updated = Math.max(0, Math.min(MAX_UNITS, units + delta));
    triggerTickSound(updated);
    onChangeUnits(updated);
  };

  return (
    <div className="w-full flex flex-col items-center select-none group cursor-help transition-all duration-300">
      <p className="text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">
        SYRINGE PREVIEW ({syringeStandard} &middot; {syringeSize} mL)
      </p>
      
      {/* Badge pills */}
      <div className="flex gap-1.5 mb-2.5 items-center">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono border transition-all duration-300 group-hover:scale-105 shadow-sm ${
          hasDestructive
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : hasWarning
            ? 'bg-warning/10 border-warning/30 text-warning'
            : 'bg-primary/10 border-primary/20 text-primary'
        }`}>
          {units.toFixed(1)} U
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-muted border border-border text-muted-foreground transition-all duration-300 group-hover:bg-muted/80">
          {volumeMl} mL
        </span>
      </div>

      {units > MAX_UNITS && (
        <span className="block text-[9px] font-semibold text-destructive mb-2 animate-pulse">
          (max {MAX_UNITS} U capacity)
        </span>
      )}

      <svg
        ref={svgRef}
        viewBox="0 0 120 410"
        className="w-full h-full max-h-[300px] outline-none touch-none"
        role="img"
        aria-label={`Visual syringe showing ${units.toFixed(1)} units filled.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        {/* Needle */}
        <line
          x1="60"
          y1="5"
          x2="60"
          y2="20"
          className="stroke-muted-foreground/80 group-hover:stroke-[hsl(var(--primary))]/50 transition-colors duration-300"
          strokeWidth="1"
        />

        {/* Needle Hub */}
        <polygon
          points="56,20 64,20 62,30 58,30"
          className="fill-muted stroke-border group-hover:stroke-[hsl(var(--primary))]/40 group-hover:fill-muted/80 transition-all duration-300"
          strokeWidth="1"
        />

        {/* Plunger + Stopper Group (hardware-accelerated transition unless dragging) */}
        <g
          tabIndex={onChangeUnits ? 0 : undefined}
          role={onChangeUnits ? 'slider' : undefined}
          aria-valuenow={onChangeUnits ? parseFloat(units.toFixed(1)) : undefined}
          aria-valuemin={onChangeUnits ? 0 : undefined}
          aria-valuemax={onChangeUnits ? MAX_UNITS : undefined}
          aria-label={onChangeUnits ? 'Syringe Plunger Level' : undefined}
          onKeyDown={onChangeUnits ? handleKeyDown : undefined}
          className="outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          style={{
            transform: `translateY(${fluidHeight}px)`,
            transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: onChangeUnits ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          {/* Plunger Shaft (behind fluid fill but inside barrel) */}
          <rect
            x="58"
            y={BARREL_TOP_Y + 4}
            width="4"
            height={PLUNGER_SHAFT_LENGTH}
            className="fill-muted-foreground/20 stroke-muted-foreground/30 group-hover:fill-[hsl(var(--primary))]/20 group-hover:stroke-[hsl(var(--primary))]/30 transition-all duration-300"
            strokeWidth="0.5"
          />
          {/* Plunger Flange (Thumb Rest) */}
          <ellipse
            cx="60"
            cy={BARREL_TOP_Y + 4 + PLUNGER_SHAFT_LENGTH}
            rx="12"
            ry="3"
            className="fill-muted-foreground/30 stroke-muted-foreground/50 group-hover:fill-[hsl(var(--primary))]/20 group-hover:stroke-[hsl(var(--primary))]/40 transition-all duration-300"
            strokeWidth="0.75"
          />

          {/* Rubber Stopper (Plunger Seal) */}
          <g className="group-hover:opacity-90 transition-opacity duration-300">
            {/* Stopper body */}
            <rect
              x="48"
              y={BARREL_TOP_Y - 2}
              width="24"
              height="6"
              className="fill-slate-800 dark:fill-slate-200 group-hover:fill-[hsl(var(--primary))] transition-colors duration-300"
              rx="1"
            />
            {/* Stopper top dome */}
            <path
              d={`M 48,${BARREL_TOP_Y - 2} C 48,${BARREL_TOP_Y - 4} 72,${BARREL_TOP_Y - 4} 72,${BARREL_TOP_Y - 2} Z`}
              className="fill-slate-800 dark:fill-slate-200 group-hover:fill-[hsl(var(--primary))] transition-colors duration-300"
            />
          </g>
        </g>

        {/* Fluid Fill */}
        {fluidHeight > 0 && (
          <rect
            x="48"
            y={BARREL_TOP_Y}
            width="24"
            height={fluidHeight}
            className={`${fluidColorClass} group-hover:opacity-90`}
            strokeWidth="0"
            style={{
              transition: isDragging ? 'none' : 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Barrel Outer Outline */}
        <rect
          x="48"
          y={BARREL_TOP_Y}
          width="24"
          height={BARREL_HEIGHT}
          className="fill-transparent stroke-border group-hover:stroke-[hsl(var(--primary))]/80 transition-colors duration-300"
          strokeWidth="1.5"
          rx="1"
        />

        {/* Barrel Flanges (Finger Grips) */}
        <path
          d="M 38,210 L 82,210 A 4,4 0 0,1 82,214 L 38,214 A 4,4 0 0,1 38,210 Z"
          className="fill-muted stroke-border group-hover:stroke-[hsl(var(--primary))]/40 transition-colors duration-300"
          strokeWidth="1"
        />

        {/* Scale Ticks (Left Side of Barrel) */}
        <g className="pointer-events-none">
          {/* Major Ticks */}
          {MAJOR_TICKS.map((val) => {
            const tickY = BARREL_TOP_Y + (val / MAX_UNITS) * BARREL_HEIGHT;
            return (
              <g key={`major-${val}`}>
                <line
                  x1="48"
                  y1={tickY}
                  x2="53"
                  y2={tickY}
                  className="stroke-foreground/60 group-hover:stroke-[hsl(var(--primary))]/60 transition-colors duration-300"
                  strokeWidth="1"
                />
                <text
                  x="44"
                  y={tickY + 2.5}
                  className="text-[6.5px] font-mono fill-muted-foreground font-semibold group-hover:fill-[hsl(var(--primary))] transition-colors duration-300"
                  textAnchor="end"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Minor Ticks */}
          {MINOR_TICKS.map((val) => {
            const tickY = BARREL_TOP_Y + (val / MAX_UNITS) * BARREL_HEIGHT;
            return (
              <line
                key={`minor-${val}`}
                x1="48"
                y1={tickY}
                x2="51"
                y2={tickY}
                className="stroke-foreground/30 group-hover:stroke-[hsl(var(--primary))]/30 transition-colors duration-300"
                strokeWidth="0.75"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
