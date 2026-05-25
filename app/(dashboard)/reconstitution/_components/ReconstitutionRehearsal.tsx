'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getAudioPlayer } from '@/lib/reconstitution/domain/audioSynth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bacWaterMl: number;
  compoundName: string;
  compoundSlug: string;
}

function getCapColor(compoundSlug: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': 'hsl(35.5 96% 43.1%)',
    'semaglutide': 'hsl(142.5 76% 36.3%)',
    'bpc-157': 'hsl(262.1 83.3% 57.8%)',
  };
  return knownColors[compoundSlug] || 'hsl(215 16% 47%)';
}

function getCapColorName(compoundSlug: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': 'Amber/Orange',
    'semaglutide': 'Green',
    'bpc-157': 'Purple',
  };
  return knownColors[compoundSlug] || 'Gray';
}

// Logarithmic scaling function for visual height (MMR F-004)
function calculateVisualHeight(volumeMl: number): number {
  const MIN_PCT = 15;
  const MAX_PCT = 85;
  const MAX_VOLUME = 10; // mL
  const clampedVolume = Math.min(MAX_VOLUME, Math.max(0, volumeMl));
  if (clampedVolume === 0) return 0;
  return MIN_PCT + (Math.log(1 + clampedVolume) / Math.log(1 + MAX_VOLUME)) * (MAX_PCT - MIN_PCT);
}

export function ReconstitutionRehearsal({ isOpen, onClose, bacWaterMl, compoundName, compoundSlug }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isAnimating, setIsAnimating] = useState(false);

  // Audio configuration state
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Fluid and plunger states
  const [waterVialVol, setWaterVialVol] = useState(10); // Start with 10 mL of water
  const [syringeVol, setSyringeVol] = useState(0);      // Syringe starts empty
  const [peptideVialVol, setPeptideVialVol] = useState(0); // Peptide vial starts dry
  
  // Opacity of powder cake
  const [powderOpacity, setPowderOpacity] = useState(1.0);
  const [isSwirling, setIsSwirling] = useState(false);

  // Positional coordinates for syringe
  const [syringeX, setSyringeX] = useState(25); // Starts over BAC water vial (25%)
  const [syringeY, setSyringeY] = useState(0);   // Starts inserted (translateY = 0)

  // Slosh/wave amplitude offsets
  const [waveOffsetWater, setWaveOffsetWater] = useState(0);
  const [waveOffsetPeptide, setWaveOffsetPeptide] = useState(0);

  const capColor = getCapColor(compoundSlug);
  const capColorName = getCapColorName(compoundSlug);

  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animFrameWaterRef = useRef<number | null>(null);
  const animFramePeptideRef = useRef<number | null>(null);
  const swirlTickRef = useRef<number | null>(null);

  const startInterval = (callback: () => void, ms: number) => {
    const id = setInterval(callback, ms);
    intervalsRef.current.push(id);
    return id;
  };

  const startTimeout = (callback: () => void, ms: number) => {
    const id = setTimeout(callback, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  // Safe Audio context lazy toggler
  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    if (nextVal) {
      getAudioPlayer().resume();
    }
  };

  // Helper to trigger damped spring slosh/wave animations
  const triggerWaveWater = (initialKick = 8) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setWaveOffsetWater(0);
      return;
    }
    if (animFrameWaterRef.current) cancelAnimationFrame(animFrameWaterRef.current);

    let pos = initialKick;
    let vel = 0;
    const springConstant = 0.15;
    const damping = 0.85;

    const stepFrame = () => {
      const force = -springConstant * pos;
      vel += force;
      vel *= damping;
      pos += vel;
      setWaveOffsetWater(pos);

      if (Math.abs(pos) > 0.05 || Math.abs(vel) > 0.05) {
        animFrameWaterRef.current = requestAnimationFrame(stepFrame);
      } else {
        setWaveOffsetWater(0);
      }
    };
    animFrameWaterRef.current = requestAnimationFrame(stepFrame);
  };

  const triggerWavePeptide = (initialKick = 8) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setWaveOffsetPeptide(0);
      return;
    }
    if (animFramePeptideRef.current) cancelAnimationFrame(animFramePeptideRef.current);

    let pos = initialKick;
    let vel = 0;
    const springConstant = 0.15;
    const damping = 0.85;

    const stepFrame = () => {
      const force = -springConstant * pos;
      vel += force;
      vel *= damping;
      pos += vel;
      setWaveOffsetPeptide(pos);

      if (Math.abs(pos) > 0.05 || Math.abs(vel) > 0.05) {
        animFramePeptideRef.current = requestAnimationFrame(stepFrame);
      } else {
        setWaveOffsetPeptide(0);
      }
    };
    animFramePeptideRef.current = requestAnimationFrame(stepFrame);
  };

  // Clean up animations and timeouts
  const cleanupAllFrames = () => {
    if (animFrameWaterRef.current) cancelAnimationFrame(animFrameWaterRef.current);
    if (animFramePeptideRef.current) cancelAnimationFrame(animFramePeptideRef.current);
    if (swirlTickRef.current) cancelAnimationFrame(swirlTickRef.current);
    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current.forEach(clearTimeout);
    intervalsRef.current = [];
    timeoutsRef.current = [];
  };

  // Reset state when modal is opened and clean up intervals on unmount/close
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setIsAnimating(false);
      setWaterVialVol(10);
      setSyringeVol(0);
      setPeptideVialVol(0);
      setPowderOpacity(1.0);
      setIsSwirling(false);
      setSyringeX(25);
      setSyringeY(0);
      setWaveOffsetWater(0);
      setWaveOffsetPeptide(0);
    } else {
      cleanupAllFrames();
      setIsAnimating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => cleanupAllFrames();
  }, []);

  if (!isOpen) return null;

  // Animate drawing water into syringe
  const handleDrawWater = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    
    if (soundEnabled) {
      getAudioPlayer().playSwoosh();
    }
    triggerWaveWater(6);

    let currentStep = 0;
    const duration = 2000; // 2 seconds
    const intervalTime = 50;
    const totalSteps = duration / intervalTime;
    
    const interval = startInterval(() => {
      currentStep++;
      const ratio = currentStep / totalSteps;
      
      setWaterVialVol(10 - bacWaterMl * ratio);
      setSyringeVol(bacWaterMl * ratio);

      if (currentStep % 4 === 0) {
        triggerWaveWater(4);
      }
      
      if (currentStep >= totalSteps) {
        clearInterval(interval);
        setIsAnimating(false);
        triggerWaveWater(6);
      }
    }, intervalTime);
  };

  // Lift, slide, and insert syringe over the peptide vial
  const handleTransferSyringe = () => {
    if (isAnimating) return;
    setIsAnimating(true);

    if (soundEnabled) {
      getAudioPlayer().playNeedleSnap();
    }

    // 1. Lift syringe
    setSyringeY(-60);

    startTimeout(() => {
      // 2. Slide horizontally
      setSyringeX(75);
      
      startTimeout(() => {
        // 3. Insert syringe
        setSyringeY(0);
        if (soundEnabled) {
          getAudioPlayer().playNeedleSnap();
        }
        
        startTimeout(() => {
          setIsAnimating(false);
          setStep(2);
        }, 400);
      }, 800);
    }, 400);
  };

  // Inject BAC water into peptide vial
  const handleInjectWater = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    
    if (soundEnabled) {
      getAudioPlayer().playSwoosh();
    }
    triggerWavePeptide(5);

    let currentStep = 0;
    const duration = 2000;
    const intervalTime = 50;
    const totalSteps = duration / intervalTime;
    
    const interval = startInterval(() => {
      currentStep++;
      const ratio = currentStep / totalSteps;
      
      setSyringeVol(bacWaterMl * (1 - ratio));
      setPeptideVialVol(bacWaterMl * ratio);

      if (currentStep % 4 === 0) {
        triggerWavePeptide(4);
      }
      
      if (currentStep >= totalSteps) {
        clearInterval(interval);
        setIsAnimating(false);
        triggerWavePeptide(7);
      }
    }, intervalTime);
  };

  // Swirl to dissolve powder
  const handleSwirl = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIsSwirling(true);

    if (soundEnabled) {
      getAudioPlayer().playSwirlChime();
    }

    // Continuous swirling liquid wave slosh animation loop
    const hasReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!hasReducedMotion) {
      const start = Date.now();
      const swirlStep = () => {
        const elapsed = Date.now() - start;
        setWaveOffsetPeptide(Math.sin(elapsed / 80) * 5);
        if (isSwirling) {
          swirlTickRef.current = requestAnimationFrame(swirlStep);
        }
      };
      swirlTickRef.current = requestAnimationFrame(swirlStep);
    }

    let currentStep = 0;
    const duration = 2500;
    const intervalTime = 50;
    const totalSteps = duration / intervalTime;

    const interval = startInterval(() => {
      currentStep++;
      const ratio = currentStep / totalSteps;

      // Play swirl sound twice during dissolve
      if (soundEnabled && currentStep === Math.floor(totalSteps / 2)) {
        getAudioPlayer().playSwirlChime();
      }

      setPowderOpacity(Math.max(0, 1 - ratio * 1.2));

      if (currentStep >= totalSteps) {
        clearInterval(interval);
        setIsSwirling(false);
        if (swirlTickRef.current) cancelAnimationFrame(swirlTickRef.current);
        setIsAnimating(false);
        triggerWavePeptide(8);
        setStep(4);
      }
    }, intervalTime);
  };

  // Render SVG element heights
  const waterHeight = calculateVisualHeight(waterVialVol);
  const peptideHeight = calculateVisualHeight(peptideVialVol);

  // Plunger height mapping (120px total plunger movement)
  const maxSyringeCapacity = Math.max(bacWaterMl, 3.0); // Assume max 3mL syringe scale
  const syringeFillRatio = syringeVol / maxSyringeCapacity;
  const plungerY = 120 - syringeFillRatio * 110;
  const syringeFluidHeight = syringeFillRatio * 110;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rehearsal-title"
      className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-[fadeIn_0.15s_ease-out]"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 md:p-8 shadow-2xl space-y-6 relative max-h-[90vh] flex flex-col justify-between">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 id="rehearsal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>🧪</span>
              <span>Reconstitution Rehearsal</span>
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Interactive visual guide for reconstituting <strong className="text-primary">{compoundName}</strong> ({bacWaterMl} mL)
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Sound FX Toggle Switch */}
            <button
              onClick={handleToggleSound}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                soundEnabled 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-850 dark:border-slate-800 dark:text-slate-500'
              }`}
              aria-label="Toggle Sound Effects"
            >
              <span>{soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 text-base font-bold p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close rehearsal"
              disabled={isAnimating}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Wizard Steps indicator */}
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-slate-400 shrink-0">
          <div className={`pb-2 border-b-2 transition-colors ${step === 1 && syringeX === 25 ? 'text-primary border-primary' : 'border-slate-100 dark:border-slate-850'}`}>
            1. DRAW WATER
          </div>
          <div className={`pb-2 border-b-2 transition-colors ${step === 1 && syringeX === 75 ? 'text-primary border-primary' : 'border-slate-100 dark:border-slate-850'}`}>
            2. TRANSFER
          </div>
          <div className={`pb-2 border-b-2 transition-colors ${step === 2 ? 'text-primary border-primary' : 'border-slate-100 dark:border-slate-850'}`}>
            3. INJECT
          </div>
          <div className={`pb-2 border-b-2 transition-colors ${step >= 3 ? 'text-primary border-primary' : 'border-slate-100 dark:border-slate-850'}`}>
            4. DISSOLVE
          </div>
        </div>

        {/* Animated Work Space */}
        <div className="flex-1 min-h-[300px] bg-slate-50 dark:bg-slate-950/40 rounded-xl relative border border-slate-100 dark:border-slate-850 overflow-hidden flex items-end justify-center py-6 select-none">
          
          {/* Column 1: BAC Water Vial */}
          <div className="absolute left-[25%] -translate-x-1/2 bottom-6 flex flex-col items-center space-y-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">BAC Water</span>
            <div className="relative">
              <svg viewBox="0 0 100 150" className="w-24 h-36 drop-shadow-md overflow-visible">
                {/* Cap color (BAC is blue) */}
                <rect x="38" y="15" width="24" height="8" rx="2" fill="hsl(200 90% 40%)" className="stroke-slate-200 dark:stroke-slate-850" strokeWidth="0.5" />
                <rect x="35" y="23" width="30" height="10" rx="1" fill="#94a3b8" />
                {/* Glass Vial Body */}
                <rect x="20" y="33" width="60" height="107" rx="10" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
                <rect x="23" y="36" width="54" height="101" rx="8" fill="rgba(255,255,255,0.05)" />
                {/* Stopper core */}
                <rect x="42" y="27" width="16" height="12" fill="#475569" rx="1" />
                {/* Fluid with sloshing wave bezier curve path */}
                {waterHeight > 0 && (
                  <path
                    d={`M 22,${138 - waterHeight} Q 50,${138 - waterHeight + waveOffsetWater} 78,${138 - waterHeight} L 78,138 L 22,138 Z`}
                    fill="url(#water-grad)"
                    className="transition-all duration-75"
                  />
                )}
                {/* Volume mark guides */}
                <g className="stroke-slate-350 dark:stroke-slate-800" strokeWidth="0.5" opacity="0.6">
                  <line x1="23" y1="50" x2="33" y2="50" />
                  <line x1="23" y1="70" x2="33" y2="70" />
                  <line x1="23" y1="90" x2="33" y2="90" />
                  <line x1="23" y1="110" x2="33" y2="110" />
                  <line x1="23" y1="130" x2="33" y2="130" />
                </g>
              </svg>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">{waterVialVol.toFixed(1)} mL</span>
          </div>

          {/* Column 2: Peptide Vial */}
          <div className="absolute left-[75%] -translate-x-1/2 bottom-6 flex flex-col items-center space-y-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{compoundName}</span>
            <div className={`relative ${isSwirling ? 'animate-[spin_1.5s_linear_infinite] origin-bottom' : ''}`}>
              <svg viewBox="0 0 100 150" className="w-24 h-36 drop-shadow-md overflow-visible">
                {/* Cap color matches compound color */}
                <rect x="38" y="15" width="24" height="8" rx="2" fill={capColor} className="stroke-slate-200 dark:stroke-slate-850" strokeWidth="0.5" />
                <rect x="35" y="23" width="30" height="10" rx="1" fill="#94a3b8" />
                {/* Glass Vial Body */}
                <rect x="20" y="33" width="60" height="107" rx="10" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
                <rect x="23" y="36" width="54" height="101" rx="8" fill="rgba(255,255,255,0.05)" />
                {/* Stopper core */}
                <rect x="42" y="27" width="16" height="12" fill="#475569" rx="1" />
                
                {/* Liquid layer with sloshing wave bezier curve path */}
                {peptideHeight > 0 && (
                  <path
                    d={`M 22,${138 - peptideHeight} Q 50,${138 - peptideHeight + waveOffsetPeptide} 78,${138 - peptideHeight} L 78,138 L 22,138 Z`}
                    fill={step >= 3 && powderOpacity === 0 ? "url(#compound-grad)" : "url(#water-grad)"}
                    className="transition-all duration-75"
                  />
                )}
                
                {/* Powder Cake (White elements dissolving) */}
                {powderOpacity > 0 && (
                  <path
                    d="M 23 138 C 30 115, 45 125, 55 120 C 65 110, 70 120, 77 138 Z"
                    fill="url(#powder-grad)"
                    className="transition-opacity duration-300"
                    style={{ opacity: powderOpacity }}
                  />
                )}
              </svg>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">
              {peptideVialVol > 0 ? `${peptideVialVol.toFixed(1)} mL` : 'Dry Powder'}
            </span>
          </div>

          {/* Floating Syringe */}
          <div
            className="absolute bottom-[96px] z-20 pointer-events-none transition-all duration-700 ease-in-out"
            style={{
              left: `${syringeX}%`,
              transform: `translateX(-50%) translateY(${syringeY}px)`,
            }}
          >
            <svg viewBox="0 0 50 200" className="w-12 h-48 overflow-visible">
              <defs>
                {/* Gradients */}
                <linearGradient id="water-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#e0f2fe" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.7" />
                </linearGradient>
                <linearGradient id="compound-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={capColor} stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.3" />
                  <stop offset="100%" stopColor={capColor} stopOpacity="0.7" />
                </linearGradient>
                <linearGradient id="powder-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {/* Syringe Plunger Shaft */}
              <line
                x1="25"
                y1={plungerY}
                x2="25"
                y2={plungerY - 30}
                stroke="#64748b"
                strokeWidth="4"
                className="transition-all duration-300"
              />
              {/* Stopper tip */}
              <rect
                x="17"
                y={plungerY}
                width="16"
                height="10"
                rx="1"
                fill="#334155"
                className="transition-all duration-300"
              />
              {/* Plunger thumb top rest */}
              <ellipse
                cx="25"
                cy={plungerY - 30}
                rx="12"
                ry="4"
                fill="#475569"
                stroke="#334155"
                strokeWidth="1"
                className="transition-all duration-300"
              />

              {/* Syringe Fluid */}
              {syringeFluidHeight > 0 && (
                <rect
                  x="17"
                  y={plungerY + 10}
                  width="16"
                  height={syringeFluidHeight}
                  fill="url(#water-grad)"
                  className="transition-all duration-300"
                />
              )}

              {/* Syringe Outer Barrel */}
              <rect x="15" y="10" width="20" height="120" rx="2" fill="none" stroke="#475569" strokeWidth="2.5" />
              <rect x="16" y="11" width="18" height="118" rx="1" fill="rgba(255,255,255,0.05)" />
              {/* Barrel Finger Holds */}
              <path d="M 15 10 Q 5 10, 5 3 Q 15 3, 15 10 Z" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <path d="M 35 10 Q 45 10, 45 3 Q 35 3, 35 10 Z" fill="#64748b" stroke="#475569" strokeWidth="1" />
              
              {/* Syringe Needle */}
              <line x1="25" y1="130" x2="25" y2="185" stroke="#475569" strokeWidth="1.5" />

              {/* Graduation marks on Syringe */}
              <g className="stroke-slate-400" strokeWidth="0.5" opacity="0.8">
                <line x1="16" y1="30" x2="22" y2="30" />
                <line x1="16" y1="50" x2="22" y2="50" />
                <line x1="16" y1="70" x2="22" y2="70" />
                <line x1="16" y1="90" x2="22" y2="90" />
                <line x1="16" y1="110" x2="22" y2="110" />
              </g>
            </svg>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4 shrink-0">
          
          {/* Step descriptions */}
          <div className="space-y-1 text-center sm:text-left">
            {step === 1 && syringeX === 25 && (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Step 1: Draw Bacteriostatic Water</p>
                <p className="text-xs text-slate-500">Insert the syringe needle into the BAC Water vial rubber stopper and pull the plunger to draw exactly <span className="font-semibold text-primary font-mono">{bacWaterMl} mL</span> of diluent.</p>
              </>
            )}
            {step === 1 && syringeX === 75 && (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Step 2: Transfer Syringe to Peptide</p>
                <p className="text-xs text-slate-500">Carefully withdraw the needle from the water vial and insert it into the rubber stopper of the dry <span className="font-semibold">{compoundName}</span> vial.</p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Step 3: Inject Diluent</p>
                <p className="text-xs text-slate-500">Slowly push the plunger down to inject the <span className="font-semibold font-mono">{bacWaterMl} mL</span> of water into the peptide vial. Let the water run slowly down the inside glass wall of the vial to avoid foaming.</p>
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Step 4: Dissolve the Peptide</p>
                <p className="text-xs text-slate-500">Gently swirl the vial. <strong className="text-amber-600 dark:text-amber-400">Never shake a peptide vial!</strong> High mechanical shear can degrade the delicate peptide chains. Swirl until the solution is clear.</p>
              </>
            )}
            {step === 4 && (
              <>
                <p className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center justify-center sm:justify-start gap-1">
                  <span>✓</span> Reconstitution Completed!
                </p>
                <p className="text-xs text-slate-500">The dry powder has dissolved fully. Note the compound&apos;s cap color is <span className="font-semibold" style={{ color: capColor }}>{capColorName}</span> for quick identification in your inventory.</p>
              </>
            )}
          </div>

          {/* Interactive Action Buttons */}
          <div className="flex justify-end gap-3 pt-1">
            {step === 1 && syringeX === 25 && (
              <button
                onClick={handleDrawWater}
                disabled={isAnimating || syringeVol >= bacWaterMl}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow btn-tactile"
              >
                {isAnimating ? 'Drawing...' : syringeVol >= bacWaterMl ? 'Water Drawn ✓' : 'Pull Plunger (Draw Water)'}
              </button>
            )}
            {step === 1 && syringeVol >= bacWaterMl && syringeX === 25 && (
              <button
                onClick={handleTransferSyringe}
                disabled={isAnimating}
                className="rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-all shadow btn-tactile"
              >
                {isAnimating ? 'Transferring...' : 'Transfer to Peptide Vial'}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={handleInjectWater}
                disabled={isAnimating || peptideVialVol >= bacWaterMl}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow btn-tactile"
              >
                {isAnimating ? 'Injecting...' : peptideVialVol >= bacWaterMl ? 'Solution Injected ✓' : 'Push Plunger (Inject Water)'}
              </button>
            )}
            {step === 2 && peptideVialVol >= bacWaterMl && (
              <button
                onClick={() => setStep(3)}
                disabled={isAnimating}
                className="rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-all shadow btn-tactile"
              >
                Proceed to Mixing
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSwirl}
                disabled={isAnimating}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow btn-tactile"
              >
                {isAnimating ? 'Swirling & Dissolving...' : 'Swirl Vial Gently'}
              </button>
            )}
            {step === 4 && (
              <button
                onClick={onClose}
                className="rounded-md bg-success text-success-foreground px-4 py-2 text-xs font-semibold hover:bg-success/90 transition-all shadow btn-tactile"
              >
                Finish Walkthrough
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
