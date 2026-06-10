'use client';

import React from 'react';
import { Snowflake, Thermometer, AlertCircle, Beaker, Volume2, VolumeX } from 'lucide-react';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';

interface Props {
  coldDryVials: SerializedVialData[];
  coldActiveVials: SerializedVialData[];
  roomTempDryVials: SerializedVialData[];
  roomTempActiveVials: SerializedVialData[];
  onAddDry: () => void;
  onAddActive: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function InventoryDashboard({
  coldDryVials,
  coldActiveVials,
  roomTempDryVials,
  roomTempActiveVials,
  onAddDry,
  onAddActive,
  soundEnabled,
  onToggleSound,
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
      <div className="flex flex-col justify-between items-start gap-4 bg-white/5 dark:bg-black/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-sm lg:flex-row lg:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Compound Inventory</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            {hasRoomTemp
              ? 'Manage your freezer, refrigerator, and room temperature storage vials.'
              : 'Manage your freezer storage (dry powder) and refrigerator storage (active reconstituted vials).'}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <button
            onClick={onToggleSound}
            type="button"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-border bg-white/5 p-2 text-muted-foreground transition-all duration-200 hover:text-foreground dark:bg-black/10"
            title={soundEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={onAddDry}
            className="flex min-h-9 min-w-[10rem] flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-700 transition-all duration-200 hover:bg-sky-500/20 dark:text-sky-300 lg:flex-none"
          >
            <Snowflake className="h-3.5 w-3.5" />
            + Add Dry Vials
          </button>
          <button
            onClick={onAddActive}
            className="flex min-h-9 min-w-[10rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all duration-200 hover:bg-primary/95 lg:flex-none"
          >
            <Beaker className="h-3.5 w-3.5" />
            + Add Reconstituted
          </button>
        </div>
      </div>

      {/* Grid of Stats */}
      <div className={`grid grid-cols-1 ${hasRoomTemp ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
        {/* Freezer Stat */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-200/20 bg-sky-500/[0.03] dark:bg-sky-950/10 p-5 backdrop-blur-md flex items-center gap-4 group hover:scale-[1.01] transition-transform duration-200">
          <div className="p-3 bg-sky-500/10 text-sky-500 rounded-xl border border-sky-400/20">
            <Snowflake className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Freezer Storage</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalColdDry}</div>
            <p className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">Dry Lyophilized Vials</p>
          </div>
        </div>

        {/* Refrigerator Stat */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] dark:bg-emerald-950/10 p-5 backdrop-blur-md flex items-center gap-4 group hover:scale-[1.01] transition-transform duration-200">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-400/20">
            <Thermometer className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Refrigerator Storage</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalColdActive}</div>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Active Reconstituted Vials</p>
          </div>
        </div>

        {/* Room Temp Storage Stat */}
        {hasRoomTemp && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-950/10 p-5 backdrop-blur-md flex items-center gap-4 group hover:scale-[1.01] transition-transform duration-200 animate-fade-in">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-400/20">
              <Thermometer className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Room Temp Storage</span>
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
        <div className="relative overflow-hidden rounded-2xl border border-warning/20 bg-warning/[0.03] dark:bg-amber-950/10 p-5 backdrop-blur-md flex items-center gap-4 group hover:scale-[1.01] transition-transform duration-200">
          <div className={`p-3 rounded-xl border ${expiredCount > 0 ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Stability Alerts</span>
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
