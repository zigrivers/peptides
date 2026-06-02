'use client';

import React, { useState, useMemo } from 'react';
import { Decimal } from 'decimal.js';
import type { DoseAmount } from '../../../../lib/reference/domain/types';
import { getVolumePerUnit } from '@/lib/reconstitution/domain/syringe';

interface DosingReconstitutionPlannerProps {
  dosingLow: DoseAmount;
  dosingTypical: DoseAmount;
  dosingHigh: DoseAmount;
  isFdaApproved: boolean;
  /** U-100 (default) or U-40 insulin-syringe standard; drives unit conversion. */
  initialSyringeStandard?: 'U100' | 'U40';
}

export function DosingReconstitutionPlanner({
  dosingLow,
  dosingTypical,
  dosingHigh,
  isFdaApproved,
  initialSyringeStandard = 'U100',
}: DosingReconstitutionPlannerProps) {
  // Helper to parse dose to mcg in Decimal
  const getAmountInMcg = (amountStr: string, unitStr: string): Decimal => {
    try {
      const amount = new Decimal(amountStr || '0');
      if (unitStr.toLowerCase() === 'mg') {
        return amount.times(1000);
      }
      return amount;
    } catch {
      return new Decimal('0');
    }
  };

  const lowMcg = useMemo(() => getAmountInMcg(dosingLow.amount, dosingLow.unit), [dosingLow]);
  const typicalMcg = useMemo(() => getAmountInMcg(dosingTypical.amount, dosingTypical.unit), [dosingTypical]);
  const highMcg = useMemo(() => getAmountInMcg(dosingHigh.amount, dosingHigh.unit), [dosingHigh]);

  // Determine standard default vial size (mg) based on typical dose range
  const defaultVialMg = useMemo(() => {
    try {
      const typicalAmt = new Decimal(dosingTypical.amount || '0');
      const isMg = dosingTypical.unit.toLowerCase() === 'mg';
      return (isMg && typicalAmt.gte(1)) || typicalMcg.gte(1000) ? 10 : 5;
    } catch {
      return 5;
    }
  }, [dosingTypical, typicalMcg]);

  const [vialSizeMg, setVialSizeMg] = useState<number>(defaultVialMg);
  const [bacWaterMl, setBacWaterMl] = useState<number>(2.0);
  const [syringeUnits, setSyringeUnits] = useState<number>(50); // 30, 50, or 100
  const [syringeStandard, setSyringeStandard] = useState<'U100' | 'U40'>(initialSyringeStandard);
  const [selectedTier, setSelectedTier] = useState<'low' | 'typical' | 'high'>('typical');

  // mL per syringe unit for the selected standard (U-100 = 0.01, U-40 = 0.025).
  // Shared with the rest of the app via the reconstitution domain so the catalog
  // planner and the standalone calculator can never diverge on unit conversion.
  const volPerUnitDec = useMemo(() => getVolumePerUnit(syringeStandard), [syringeStandard]);

  // Custom values support
  const [customVial, setCustomVial] = useState<string>('');
  const [customBac, setCustomBac] = useState<string>('');
  const [isCustomVial, setIsCustomVial] = useState<boolean>(false);
  const [isCustomBac, setIsCustomBac] = useState<boolean>(false);

  // Parse active values to Decimals
  const activeVialMgDec = useMemo(() => {
    if (isCustomVial) {
      try {
        return new Decimal(customVial || '0');
      } catch {
        return new Decimal('0');
      }
    }
    return new Decimal(vialSizeMg);
  }, [isCustomVial, customVial, vialSizeMg]);

  const activeBacMlDec = useMemo(() => {
    if (isCustomBac) {
      try {
        return new Decimal(customBac || '0');
      } catch {
        return new Decimal('0');
      }
    }
    return new Decimal(bacWaterMl);
  }, [isCustomBac, customBac, bacWaterMl]);

  // Validate inputs (must be positive numbers)
  const isInvalidInput = useMemo(() => {
    return (
      activeVialMgDec.lte(0) ||
      activeBacMlDec.lte(0) ||
      activeVialMgDec.isNaN() ||
      activeBacMlDec.isNaN()
    );
  }, [activeVialMgDec, activeBacMlDec]);

  // Active target dose calculation
  const activeDose = useMemo(() => {
    if (selectedTier === 'low') return dosingLow;
    if (selectedTier === 'high') return dosingHigh;
    return dosingTypical;
  }, [selectedTier, dosingLow, dosingTypical, dosingHigh]);

  const activeDoseMcgDec = useMemo(() => {
    return getAmountInMcg(activeDose.amount, activeDose.unit);
  }, [activeDose]);

  // Math engines using Decimal
  const totalMassMcgDec = activeVialMgDec.times(1000);
  
  const concentrationMcgPerMlDec = useMemo(() => {
    if (isInvalidInput) return new Decimal('0');
    return totalMassMcgDec.div(activeBacMlDec);
  }, [isInvalidInput, totalMassMcgDec, activeBacMlDec]);

  const drawMlDec = useMemo(() => {
    if (isInvalidInput || concentrationMcgPerMlDec.isZero()) return new Decimal('0');
    return activeDoseMcgDec.div(concentrationMcgPerMlDec);
  }, [isInvalidInput, activeDoseMcgDec, concentrationMcgPerMlDec]);

  const drawUnitsDec = useMemo(() => {
    return drawMlDec.div(volPerUnitDec);
  }, [drawMlDec, volPerUnitDec]);

  // Check syringe overflow
  const isOverflow = useMemo(() => {
    if (isInvalidInput) return false;
    return drawUnitsDec.gt(syringeUnits);
  }, [isInvalidInput, drawUnitsDec, syringeUnits]);

  // Render SVG Plunger elements
  const plungerPositionPercent = useMemo(() => {
    if (syringeUnits <= 0 || isInvalidInput) return 0;
    try {
      const pct = drawUnitsDec.div(syringeUnits).toNumber();
      return Math.min(Math.max(pct, 0), 1);
    } catch {
      return 0;
    }
  }, [drawUnitsDec, syringeUnits, isInvalidInput]);

  // Generate tick marks based on syringe sizes
  const ticks = useMemo(() => {
    const arr = [];
    const step = syringeUnits === 100 ? 10 : syringeUnits === 50 ? 5 : 5;
    for (let i = 0; i <= syringeUnits; i += step) {
      arr.push(i);
    }
    return arr;
  }, [syringeUnits]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Planner Inputs */}
        <div className="lg:col-span-7 space-y-5">
          <div className="border border-border/60 bg-background/50 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <span>⚙️</span> Interactive Reconstitution Planner
              </span>
              {isFdaApproved && (
                <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-md font-bold tracking-wide uppercase dark:bg-green-950/40 dark:text-green-300" id="fda-badge">
                  FDA Approved
                </span>
              )}
            </h3>
            
            {/* Input Config Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              
              {/* 1. Vial Size */}
              <div className="space-y-1.5 sm:col-span-4">
                {isCustomVial ? (
                  <div className="flex items-end justify-between min-h-[2rem]">
                    <label
                      htmlFor="custom-vial-input"
                      className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Vial Size (mg)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomVial(false)}
                      className="text-[10px] text-primary hover:underline font-semibold leading-none"
                    >
                      Use Presets
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="vial-size-select"
                    className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-end min-h-[2rem]"
                  >
                    Vial Size (mg)
                  </label>
                )}
                {isCustomVial ? (
                  <input
                    type="number"
                    value={customVial}
                    onChange={(e) => setCustomVial(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono text-gray-800 dark:text-gray-200"
                    min="0.1"
                    step="0.1"
                    id="custom-vial-input"
                  />
                ) : (
                  <select
                    value={vialSizeMg}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomVial(true);
                      } else {
                        setVialSizeMg(Number(e.target.value));
                      }
                    }}
                    className="w-full text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-semibold text-gray-800 dark:text-gray-200"
                    id="vial-size-select"
                  >
                    <option value="2">2 mg</option>
                    <option value="5">5 mg</option>
                    <option value="10">10 mg</option>
                    <option value="15">15 mg</option>
                    <option value="custom">Custom...</option>
                  </select>
                )}
              </div>

              {/* 2. Diluent Volume */}
              <div className="space-y-1.5 sm:col-span-4">
                {isCustomBac ? (
                  <div className="flex items-end justify-between min-h-[2rem]">
                    <label
                      htmlFor="custom-bac-input"
                      className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      BAC Water (mL)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomBac(false)}
                      className="text-[10px] text-primary hover:underline font-semibold leading-none"
                    >
                      Use Presets
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="bac-water-select"
                    className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-end min-h-[2rem]"
                  >
                    BAC Water (mL)
                  </label>
                )}
                {isCustomBac ? (
                  <input
                    type="number"
                    value={customBac}
                    onChange={(e) => setCustomBac(e.target.value)}
                    placeholder="e.g. 2.0"
                    className="w-full text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono text-gray-800 dark:text-gray-200"
                    min="0.1"
                    step="0.1"
                    id="custom-bac-input"
                  />
                ) : (
                  <select
                    value={bacWaterMl}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomBac(true);
                      } else {
                        setBacWaterMl(Number(e.target.value));
                      }
                    }}
                    className="w-full text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-semibold text-gray-800 dark:text-gray-200"
                    id="bac-water-select"
                  >
                    <option value="1">1.0 mL</option>
                    <option value="2">2.0 mL</option>
                    <option value="2.5">2.5 mL</option>
                    <option value="3">3.0 mL</option>
                    <option value="custom">Custom...</option>
                  </select>
                )}
              </div>

              {/* 3. Syringe Size */}
              <div className="space-y-1.5 sm:col-span-4">
                <label
                  htmlFor="syringe-size-select"
                  className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-end min-h-[2rem]"
                >
                  Syringe Size
                </label>
                <select
                  value={syringeUnits}
                  onChange={(e) => setSyringeUnits(Number(e.target.value))}
                  className="w-full text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-semibold text-gray-800 dark:text-gray-200"
                  id="syringe-size-select"
                >
                  {[30, 50, 100].map((u) => (
                    <option key={u} value={u}>
                      {u} Units ({volPerUnitDec.times(u).toFixed(2)} mL)
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Syringe Standard (U-100 vs U-40) — defaults to the user's saved
                preference and drives all unit conversion below. */}
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="syringe-standard-select"
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Syringe Type
              </label>
              <select
                value={syringeStandard}
                onChange={(e) => setSyringeStandard(e.target.value as 'U100' | 'U40')}
                className="text-sm rounded-lg border border-border bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-semibold text-gray-800 dark:text-gray-200"
                id="syringe-standard-select"
              >
                <option value="U100">U-100 Insulin Syringe</option>
                <option value="U40">U-40 Insulin Syringe</option>
              </select>
            </div>

            {/* Dose Level Selector (Tabs) */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Select Dose Tier to View
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'low', label: 'Low', dose: dosingLow, mcg: lowMcg },
                  { key: 'typical', label: 'Typical', dose: dosingTypical, mcg: typicalMcg },
                  { key: 'high', label: 'High', dose: dosingHigh, mcg: highMcg },
                ] as const).map((tier) => {
                  const isActive = selectedTier === tier.key;
                  const calculatedUnits = (isInvalidInput || concentrationMcgPerMlDec.isZero())
                    ? new Decimal(0)
                    : tier.mcg.div(concentrationMcgPerMlDec).div(volPerUnitDec);
                  
                  return (
                    <button
                      key={tier.key}
                      onClick={() => setSelectedTier(tier.key)}
                      className={`flex flex-col items-center p-3 rounded-lg border text-center transition-all ${
                        isActive
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border bg-card text-card-foreground hover:bg-muted/50'
                      }`}
                      id={`dose-tier-${tier.key}`}
                    >
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                        {tier.label}
                      </span>
                      <span className="mt-1 text-sm font-bold font-mono">
                        {tier.dose.amount} {tier.dose.unit}
                      </span>
                      <span className="mt-0.5 text-[10px] text-gray-400 font-semibold">
                        ≈ {calculatedUnits.toFixed(1)} Units
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Concentration Quick Info */}
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium bg-muted/30 p-2.5 rounded-lg border border-border/30 flex justify-between items-center">
              <span>
                Reconstitution Concentration:
              </span>
              <span className="font-bold font-mono text-gray-700 dark:text-gray-300">
                {isInvalidInput
                  ? '0.00 mg/mL (0.0 mcg/Unit)'
                  : `${concentrationMcgPerMlDec.div(1000).toFixed(2)} mg/mL (${concentrationMcgPerMlDec.times(volPerUnitDec).toFixed(1)} mcg/Unit)`}
              </span>
            </div>

          </div>
        </div>

        {/* Right Column: Plunger Visualizer */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div className="border border-border/60 bg-background/50 rounded-xl p-5 shadow-sm space-y-4 flex-grow flex flex-col justify-between">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-1.5">
              <span>💉</span> Visual Syringe Guide
            </h3>

            {/* Syringe Rendering Container */}
            <div className="relative py-4 flex flex-col items-center justify-center bg-card rounded-lg border border-border/40 min-h-[140px] px-2 shadow-inner">
              
              {/* Syringe Drawing SVG */}
              <svg viewBox="0 0 450 80" className="w-full max-w-[400px]">
                <defs>
                  {/* Glowing Plunger Shading */}
                  <linearGradient id="liquidGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="plungerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" />
                    <stop offset="50%" stopColor="#cbd5e1" />
                    <stop offset="100%" stopColor="#64748b" />
                  </linearGradient>
                </defs>

                {/* Needle Base on the left */}
                <rect x="15" y="37" width="15" height="6" fill="#94a3b8" />
                <line x1="0" y1="40" x2="15" y2="40" stroke="#94a3b8" strokeWidth="1.5" />

                {/* Main Barrel Outlines */}
                <rect x="30" y="20" width="310" height="40" fill="none" stroke="#64748b" strokeWidth="1.5" rx="2" />
                
                {/* Flanges / Wings on the right */}
                <rect x="339" y="10" width="6" height="60" fill="#64748b" rx="1.5" />

                {/* Liquid Volume filled area (animates width) */}
                <rect
                  x="30"
                  y="21.5"
                  width={308 * plungerPositionPercent}
                  height="37"
                  fill="url(#liquidGrad)"
                  style={{ transition: 'width 0.3s ease-in-out' }}
                />

                {/* Plunger Shaft & Rubber Stopper tip */}
                {/* Shaft */}
                <rect
                  x={30 + 308 * plungerPositionPercent}
                  y="36"
                  width={340 - (30 + 308 * plungerPositionPercent)}
                  height="8"
                  fill="url(#plungerGrad)"
                  style={{ transition: 'x 0.3s ease-in-out, width 0.3s ease-in-out' }}
                />
                
                {/* Rubber Stopper black tip */}
                <rect
                  x={24 + 308 * plungerPositionPercent}
                  y="21"
                  width="8"
                  height="38"
                  fill="#0f172a"
                  rx="1"
                  style={{ transition: 'x 0.3s ease-in-out' }}
                />

                {/* Plunger thumb rest/handle on the right */}
                <rect
                  x={336 + (340 - (30 + 308 * plungerPositionPercent))}
                  y="15"
                  width="6"
                  height="50"
                  fill="#64748b"
                  rx="1"
                  style={{ transition: 'x 0.3s ease-in-out' }}
                />

                {/* Tick marks on barrel */}
                {ticks.map((val) => {
                  const xCoord = 30 + (val / syringeUnits) * 308;
                  const isLabeled = val % (syringeUnits === 100 ? 10 : 5) === 0;
                  
                  return (
                    <g key={val}>
                      <line
                        x1={xCoord}
                        y1="20"
                        x2={xCoord}
                        y2={isLabeled ? "28" : "24"}
                        stroke="#475569"
                        strokeWidth="1"
                      />
                      <line
                        x1={xCoord}
                        y1="60"
                        x2={xCoord}
                        y2={isLabeled ? "52" : "56"}
                        stroke="#475569"
                        strokeWidth="1"
                      />
                      {isLabeled && val > 0 && val < syringeUnits && (
                        <text
                          x={xCoord}
                          y="43"
                          fontSize="7"
                          fontFamily="monospace"
                          fontWeight="bold"
                          fill="#475569"
                          textAnchor="middle"
                        >
                          {val}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Status and instruction underneath */}
              <div className="mt-3 text-center space-y-0.5">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                  {isInvalidInput ? 'Calculation Unavailable' : 'Draw plunger exactly to:'}
                </p>
                <p className="text-base font-black text-primary font-mono" id="draw-units-text">
                  {isInvalidInput ? '0.0' : drawUnitsDec.toFixed(1)} Units
                </p>
                <p className="text-[10px] text-gray-400 font-semibold font-mono">
                  {isInvalidInput
                    ? '— mL / — mcg'
                    : `(${drawMlDec.toFixed(3)} mL / ${activeDoseMcgDec.toFixed(0)} mcg)`}
                </p>
              </div>

            </div>

            {/* Error alerts or safety caps */}
            <div className="mt-2 min-h-[40px]">
              {isInvalidInput ? (
                <div className="border border-yellow-200 bg-yellow-50/70 p-3 rounded-lg dark:border-yellow-950/30 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-300 text-xs leading-relaxed flex gap-2" id="invalid-inputs-warning">
                  <span className="text-sm shrink-0">⚠️</span>
                  <div>
                    <strong className="font-semibold">Invalid Reconstitution Parameters:</strong> Please enter a positive custom vial size (mg) and BAC water dilution (mL) to view drawing calculations.
                  </div>
                </div>
              ) : isOverflow ? (
                <div className="border border-red-200 bg-red-50/70 p-3 rounded-lg dark:border-red-950/30 dark:bg-red-950/20 text-red-800 dark:text-red-300 text-xs leading-relaxed flex gap-2" id="syringe-overflow-warning">
                  <span className="text-sm shrink-0">🚨</span>
                  <div>
                    <strong className="font-semibold">Syringe Overflow Alert:</strong> This target dose ({activeDose.amount} {activeDose.unit}) requires {drawUnitsDec.toFixed(1)} units, which exceeds your {syringeUnits} Unit syringe limit. Reconstitute with less BAC water (e.g. 1.0 mL) to increase concentration, or administer across multiple separate draws.
                  </div>
                </div>
              ) : (
                <div className="border border-green-200 bg-green-50/50 p-2.5 rounded-lg dark:border-green-950/20 dark:bg-green-950/10 text-green-800 dark:text-green-300 text-xs leading-relaxed flex gap-2">
                  <span className="text-sm shrink-0">✅</span>
                  <div>
                    Dose fits securely in a standard <span className="font-semibold">{syringeUnits} Unit</span> insulin syringe.
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Safety Reconstitution Checklist Card */}
      <div className="border border-border/60 bg-background/50 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-1.5">
          <span>💡</span> Reconstitution Preparation Checklist
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div className="space-y-3">
            <div className="flex gap-2.5 items-start">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">1</span>
              <p className="leading-relaxed">
                <strong className="text-gray-700 dark:text-gray-300 font-semibold">Sanitize Equipment:</strong> Swab the top of the lyophilized peptide vial and the Bacteriostatic Water bottle rubber stopper with a fresh alcohol pad. Allow them to air-dry.
              </p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">2</span>
              <p className="leading-relaxed">
                <strong className="text-gray-700 dark:text-gray-300 font-semibold">Equalize Pressure:</strong> Draw exactly <span className="font-mono">{isInvalidInput ? '2.0' : activeBacMlDec.toFixed(1)} mL</span> of air into the syringe, insert the needle into the BAC Water bottle, inject the air, and then draw out <span className="font-mono">{isInvalidInput ? '2.0' : activeBacMlDec.toFixed(1)} mL</span> of liquid BAC water.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2.5 items-start">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">3</span>
              <p className="leading-relaxed">
                <strong className="text-gray-700 dark:text-gray-300 font-semibold">Inject Slowly:</strong> Insert the needle into the peptide vial and aim the stream along the glass wall. Slowly inject the water. Do <strong className="text-red-500 font-bold">NOT</strong> inject directly into the powder, which can degrade the fragile peptide chains.
              </p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">4</span>
              <p className="leading-relaxed">
                <strong className="text-gray-700 dark:text-gray-300 font-semibold">Dissolve Gently:</strong> Withdraw the needle. Do <strong className="text-red-500 font-bold">NOT</strong> shake the vial. Roll it gently between your palms or swirl in a slow circle until the liquid is fully transparent and clear.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
