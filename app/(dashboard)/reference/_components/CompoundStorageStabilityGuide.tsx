'use client';

import React from 'react';
import { Snowflake, Thermometer, Calendar, AlertTriangle, Info } from 'lucide-react';

interface Props {
  compoundName: string;
  fridgeShelfLifeMonths?: number | null;
  freezerShelfLifeMonths?: number | null;
  reconstitutedShelfLifeDays?: number | null;
}

export function CompoundStorageStabilityGuide({
  compoundName,
  fridgeShelfLifeMonths = 12,
  freezerShelfLifeMonths = 24,
  reconstitutedShelfLifeDays = 14,
}: Props) {
  const isRoomTempOnly = fridgeShelfLifeMonths === null && freezerShelfLifeMonths === null;

  return (
    <section className="border border-border/60 bg-background/50 rounded-xl p-5 shadow-sm space-y-5 animate-[fadeIn_0.3s_ease-out]">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground" id="storage-stability-header">
        <span>🛡️</span> Storage & Stability Guide
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* 1. Unopened State Card */}
        <div className="border border-border/50 bg-card rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-4 relative overflow-hidden group">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Unopened State
              </span>
              <span className="text-[11px] text-muted-foreground font-semibold">
                Factory Sealed / Dry
              </span>
            </div>

            <h3 className="text-sm font-bold text-foreground">
              Storage Requirements
            </h3>

            {isRoomTempOnly ? (
              <div className="space-y-2.5">
                {/* Room Temp Option */}
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-950/20 dark:bg-amber-950/10">
                  <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                    <Thermometer className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-800 dark:text-amber-400">Room Temp (20°C to 25°C)</div>
                    <div className="text-[10px] text-amber-700 dark:text-amber-500 font-semibold mt-0.5">Recommended Storage</div>
                  </div>
                </div>

                {/* Freezer / Fridge Warning */}
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-950/20 dark:bg-red-950/10 opacity-75">
                  <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-red-800 dark:text-red-400">Cold Storage Prohibited</div>
                    <div className="text-[10px] text-red-700 dark:text-red-500 font-semibold mt-0.5">Do NOT freeze or refrigerate</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Freezer Option */}
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-blue-200 bg-blue-50/40 dark:border-blue-950/20 dark:bg-blue-950/10">
                  <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                    <Snowflake className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-800 dark:text-blue-400">Freezer (-20°C)</div>
                    <div className="text-[10px] text-blue-700 dark:text-blue-500 font-semibold mt-0.5">Recommended (up to {freezerShelfLifeMonths ?? 24} months)</div>
                  </div>
                </div>

                {/* Fridge Option */}
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40 dark:border-emerald-950/20 dark:bg-emerald-950/10">
                  <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <Thermometer className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400">Refrigerator (2°C to 8°C)</div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-500 font-semibold mt-0.5">Acceptable (up to {fridgeShelfLifeMonths ?? 12} months)</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>
              {isRoomTempOnly 
                ? 'Refer to the manufacturer expiration date printed on the vial.' 
                : 'Keep dry/lyophilized vials in cold storage until ready to mix.'}
            </span>
          </div>
        </div>

        {/* 2. Opened / Active State Card */}
        <div className="border border-border/50 bg-card rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-4 relative overflow-hidden group">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider dark:bg-emerald-950/40 dark:text-emerald-400">
                Opened State
              </span>
              <span className="text-[11px] text-muted-foreground font-semibold">
                {isRoomTempOnly ? 'Punctured / In Use' : 'Reconstituted Liquid'}
              </span>
            </div>

            <h3 className="text-sm font-bold text-foreground">
              Stability Profile
            </h3>

            <div className="space-y-2.5">
              {/* Primary Storage */}
              <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                isRoomTempOnly 
                  ? 'border-amber-200 bg-amber-50/50 dark:border-amber-950/20 dark:bg-amber-950/10' 
                  : 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-950/20 dark:bg-emerald-950/10'
              }`}>
                <div className={`p-1.5 rounded-md ${
                  isRoomTempOnly 
                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' 
                    : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <Thermometer className="h-4 w-4" />
                </div>
                <div>
                  <div className={`text-xs font-bold ${isRoomTempOnly ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-800 dark:text-emerald-400'}`}>
                    {isRoomTempOnly ? 'Room Temp Storage Only' : 'Refrigerator Storage Required'}
                  </div>
                  <div className={`text-[10px] ${isRoomTempOnly ? 'text-amber-700 dark:text-amber-500' : 'text-emerald-700 dark:text-emerald-500'} font-semibold mt-0.5`}>
                    {isRoomTempOnly ? 'Store in cool, dry cupboard' : 'Maintain temperature between 2°C - 8°C'}
                  </div>
                </div>
              </div>

              {/* Shelf-Life Limit */}
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/40 dark:border-indigo-950/20 dark:bg-indigo-950/10">
                <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-indigo-800 dark:text-indigo-400">
                    Discard After {reconstitutedShelfLifeDays ?? 14} Days
                  </div>
                  <div className="text-[10px] text-indigo-700 dark:text-indigo-500 font-semibold mt-0.5">
                    {isRoomTempOnly ? 'USP <797> multidose puncture limit' : 'Peptide potency degradation threshold'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isRoomTempOnly
                ? 'Store upright to prevent solution contact with the punctured rubber stopper.'
                : 'Never freeze after mixing. Shaking reconstituted peptide can damage structural chains.'}
            </span>
          </div>
        </div>

      </div>

      {/* Dynamic Temperature Warning Footer Banner */}
      {isRoomTempOnly ? (
        <div className="border border-amber-200/80 bg-amber-50/60 p-3 rounded-lg dark:border-amber-950/30 dark:bg-amber-950/20">
          <div className="flex gap-2.5 text-amber-800 dark:text-amber-300">
            <span className="text-base shrink-0">⚠️</span>
            <div className="text-xs leading-relaxed">
              <strong className="font-bold">Testosterone Storage Advisory:</strong> Storing oil-based solutions in the refrigerator or freezer causes the compound to crash or precipitate, forming visible hormone crystals. If crystallization occurs, warm the vial gently to room temperature and roll between hands to dissolve before drawing.
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-blue-200/80 bg-blue-50/40 p-3 rounded-lg dark:border-blue-950/30 dark:bg-blue-950/10">
          <div className="flex gap-2.5 text-blue-800 dark:text-blue-300">
            <span className="text-base shrink-0">❄️</span>
            <div className="text-xs leading-relaxed">
              <strong className="font-bold">Peptide Cold-Chain Advisory:</strong> Lyophilized peptides are highly fragile proteins. Keep out of direct sunlight and minimize heat exposure to prevent loss of potency. Unused vials are best stored long-term in the freezer.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
