'use client';

import React from 'react';
import { Snowflake, Thermometer, AlertCircle, Beaker } from 'lucide-react';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';

interface Props {
  coldDryVials: SerializedVialData[];
  coldActiveVials: SerializedVialData[];
  roomTempDryVials: SerializedVialData[];
  roomTempActiveVials: SerializedVialData[];
  onAddDry: () => void;
  onAddActive: () => void;
}

export function InventoryDashboard({
  coldDryVials,
  coldActiveVials,
  roomTempDryVials,
  roomTempActiveVials,
  onAddDry,
  onAddActive,
}: Props) {
  // Count stats
  const totalColdDry = coldDryVials.length;
  const totalColdActive = coldActiveVials.length;
  const totalRoomTempDry = roomTempDryVials.length;
  const totalRoomTempActive = roomTempActiveVials.length;
  const hasRoomTemp = (totalRoomTempDry + totalRoomTempActive) > 0;

  // Alerts - computed across ALL vials (cold + room temp)
  const allDry = [...coldDryVials, ...roomTempDryVials];
  const allActive = [...coldActiveVials, ...roomTempActiveVials];
  const expiredCount = [...allDry, ...allActive].filter((v) => v.badges.includes('EXPIRED')).length;
  const expiringSoonCount = [...allDry, ...allActive].filter((v) => v.badges.includes('EXPIRING_SOON')).length;
  const lowInventoryCount = allActive.filter((v) => v.badges.includes('LOW_INVENTORY')).length;

  return (
    <div className="space-y-6">
      {/* Action header */}
      <div className="flex flex-col justify-between items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Compound Inventory</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            {hasRoomTemp
              ? 'Track ready vials, dry reserves, room-temperature stock, and stability alerts.'
              : 'Track ready reconstituted vials, dry reserves, and stability alerts.'}
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
          <button
            onClick={onAddDry}
            type="button"
            className="flex min-h-10 min-w-[11rem] items-center justify-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-700 transition-colors duration-200 hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
          >
            <Snowflake className="h-3.5 w-3.5" />
            Add dry vials
          </button>
          <button
            onClick={onAddActive}
            type="button"
            className="flex min-h-10 min-w-[11rem] items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition-colors duration-200 hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Beaker className="h-3.5 w-3.5" />
            Add ready vial
          </button>
        </div>
      </div>

      {/* Grid of Stats */}
      <div className={`grid grid-cols-1 ${hasRoomTemp ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
        {/* Freezer Stat */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-sky-200/20 bg-sky-500/[0.03] p-5 backdrop-blur-md transition-shadow duration-200 hover:shadow-md dark:bg-sky-950/10">
          <div className="rounded-md border border-sky-400/20 bg-sky-500/10 p-3 text-sky-500">
            <Snowflake className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Dry reserves</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalColdDry}</div>
            <p className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">Freezer vials ready to mix</p>
          </div>
        </div>

        {/* Refrigerator Stat */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-5 backdrop-blur-md transition-shadow duration-200 hover:shadow-md dark:bg-emerald-950/10">
          <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-emerald-500">
            <Thermometer className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Ready vials</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalColdActive}</div>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Reconstituted and tracked</p>
          </div>
        </div>

        {/* Room Temp Storage Stat */}
        {hasRoomTemp && (
          <div className="relative flex animate-fade-in items-center gap-4 overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-5 backdrop-blur-md transition-shadow duration-200 hover:shadow-md dark:bg-amber-950/10">
            <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-amber-500">
              <Thermometer className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Room temp</span>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {totalRoomTempDry + totalRoomTempActive}
              </div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                {totalRoomTempActive} Opened / {totalRoomTempDry} Unopened
              </p>
            </div>
          </div>
        )}

        {/* Alerts Stat */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-warning/20 bg-warning/[0.03] p-5 backdrop-blur-md transition-shadow duration-200 hover:shadow-md dark:bg-amber-950/10">
          <div className={`rounded-md border p-3 ${expiredCount > 0 ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Needs attention</span>
            <div className="text-2xl font-black text-foreground mt-0.5">
              {expiredCount + expiringSoonCount + lowInventoryCount}
            </div>
            <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground mt-0.5 font-medium">
              {expiredCount > 0 && <span className="text-destructive font-semibold">{expiredCount} Expired</span>}
              {expiringSoonCount > 0 && <span className="text-amber-500">{expiringSoonCount} Expiring Soon</span>}
              {lowInventoryCount > 0 && <span className="text-orange-500">{lowInventoryCount} Low</span>}
              {expiredCount === 0 && expiringSoonCount === 0 && lowInventoryCount === 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All vials stable & good</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
