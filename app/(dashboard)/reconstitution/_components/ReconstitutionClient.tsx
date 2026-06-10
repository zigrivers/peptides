'use client';

import React, { useState, useEffect } from 'react';
import type {
  SerializedVialData,
  CompoundInventorySummary,
} from '@/lib/reconstitution/application/VialService';
import type { Compound } from '@/lib/reference/domain/types';
import { InventoryDashboard } from './InventoryDashboard';
import { DryInventoryList } from './DryInventoryList';
import { VialInventory } from './VialInventory';
import { CompoundInventoryView } from './CompoundInventoryView';
import { AddDryVialsModal } from './AddDryVialsModal';
import { AddActiveVialModal } from './AddActiveVialModal';
import { ReconstituteModal } from './ReconstituteModal';
import { Snowflake, Thermometer, Calculator, Boxes, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';
import { getAudioPlayer } from '@/lib/reconstitution/domain/audioSynth';
import { ReconstitutionCalculatorForm } from './ReconstitutionCalculatorForm';
import { SubjectSelector, type SubjectOption } from './SubjectSelector';

interface Props {
  userId: string;
  actorUserId: string;
  managedUsers: SubjectOption[];
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  compoundsMinimal: Pick<Compound, 'id' | 'name' | 'slug'>[];
  dryVials: SerializedVialData[];
  activeVials: SerializedVialData[];
  inventorySummary: CompoundInventorySummary[];
  reconstitutedVialsByCompound: Record<string, SerializedVialData[]>;
  syringeStandard: 'U100' | 'U40';
  syringeSize: '0.3' | '0.5' | '1.0';
  autoReconstituteCompoundId?: string;
}

export function ReconstitutionClient({
  userId,
  actorUserId,
  managedUsers,
  compounds,
  compoundsMinimal,
  dryVials,
  activeVials,
  inventorySummary,
  reconstitutedVialsByCompound,
  syringeStandard,
  syringeSize,
  autoReconstituteCompoundId,
}: Props) {
  const [viewMode, setViewMode] = useState<'storage' | 'compound'>('storage');
  const [storageFilter, setStorageFilter] = useState<'all' | 'fridge' | 'freezer' | 'room_temp'>('all');
  const [calculatorExpanded, setCalculatorExpanded] = useState(false);
  const [showAddDryModal, setShowAddDryModal] = useState(false);
  const [addDryCompoundId, setAddDryCompoundId] = useState<string | undefined>(undefined);
  const [showAddActiveModal, setShowAddActiveModal] = useState(false);
  const [reconstitutingVial, setReconstitutingVial] = useState<SerializedVialData | null>(null);
  
  // Persistent sound effects active state (safely hydrated on mount to avoid Next.js hydration differences)
  const [isMounted, setIsMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Helper to determine if a compound is room temp only
  const isRoomTempCompound = React.useCallback((compoundId: string) => {
    const c = compounds.find((x) => x.id === compoundId);
    return c?.profile?.fridgeShelfLifeMonths === null && c?.profile?.freezerShelfLifeMonths === null;
  }, [compounds]);

  // Partition dry and active vials by storage type (cold vs room temp)
  const { coldDryVials, roomTempDryVials, coldActiveVials, roomTempActiveVials } = React.useMemo(() => {
    return {
      coldDryVials: dryVials.filter((v) => !isRoomTempCompound(v.compoundId)),
      roomTempDryVials: dryVials.filter((v) => isRoomTempCompound(v.compoundId)),
      coldActiveVials: activeVials.filter((v) => !isRoomTempCompound(v.compoundId)),
      roomTempActiveVials: activeVials.filter((v) => isRoomTempCompound(v.compoundId)),
    };
  }, [dryVials, activeVials, isRoomTempCompound]);

  useEffect(() => {
    const saved = localStorage.getItem('peptides_sound_effects_enabled');
    if (saved === 'false') {
      setSoundEnabled(false);
    }
    setIsMounted(true);
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const nextVal = !prev;
      localStorage.setItem('peptides_sound_effects_enabled', String(nextVal));
      return nextVal;
    });
  };

  const playSoundEffect = (type: 'swoosh' | 'chime') => {
    if (!isMounted || !soundEnabled) return;
    const player = getAudioPlayer();
    if (type === 'swoosh') {
      player.playSwoosh();
    } else if (type === 'chime') {
      player.playSwirlChime();
    }
  };

  // Auto-focus reconstitution if triggered from Refill Planner URL link
  const [autoTriggered, setAutoTriggered] = useState(false);
  useEffect(() => {
    if (autoReconstituteCompoundId && !autoTriggered && dryVials.length > 0) {
      const match = [...dryVials]
        .filter((v) => v.compoundId === autoReconstituteCompoundId)
        .sort((a, b) => {
          if (!a.expiresAt) return 1;
          if (!b.expiresAt) return -1;
          return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        })[0];

      if (match) {
        setReconstitutingVial(match);
      }
      setAutoTriggered(true);
    }
  }, [autoReconstituteCompoundId, dryVials, autoTriggered]);

  return (
    <div className="space-y-10">
      {/* Caregiver subject switcher — only rendered when the actor manages someone.
          `userId` here is the resolved subjectUserId. */}
      <SubjectSelector
        actorUserId={actorUserId}
        subjectUserId={userId}
        managedUsers={managedUsers}
      />

      {/* Summary dashboard at the top */}
      <InventoryDashboard
        coldDryVials={coldDryVials}
        coldActiveVials={coldActiveVials}
        roomTempDryVials={roomTempDryVials}
        roomTempActiveVials={roomTempActiveVials}
        onAddDry={() => {
          setAddDryCompoundId(undefined);
          setShowAddDryModal(true);
        }}
        onAddActive={() => setShowAddActiveModal(true)}
        soundEnabled={isMounted ? soundEnabled : true}
        onToggleSound={toggleSound}
      />

      {/* View toggle: By storage ↔ By compound */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('storage')}
            className={`min-h-9 flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors ${viewMode === 'storage' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
          >
            <LayoutGrid className="h-4 w-4" /> By storage
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compound')}
            className={`min-h-9 flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors ${viewMode === 'compound' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
          >
            <Boxes className="h-4 w-4" /> By compound
          </button>
        </div>
      </div>

      {viewMode === 'compound' && (
        <CompoundInventoryView
          userId={userId}
          summaries={inventorySummary}
          compounds={compoundsMinimal}
          dryVials={dryVials}
          reconstitutedVialsByCompound={reconstitutedVialsByCompound}
          onReconstitute={setReconstitutingVial}
          onAddVials={(compoundId) => {
            setAddDryCompoundId(compoundId);
            setShowAddDryModal(true);
          }}
        />
      )}

      {viewMode === 'storage' && (
        <div className="space-y-8">
          {/* Sub-tabs for filtering storage sections */}
          <div className="flex flex-wrap items-center gap-2 justify-start border-b border-border/50 pb-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-2">Filter storage:</span>
            <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStorageFilter('all')}
                className={`min-h-9 px-3 py-2 rounded-md transition-colors ${storageFilter === 'all' ? 'bg-background shadow text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStorageFilter('fridge')}
                className={`min-h-9 px-3 py-2 rounded-md transition-colors ${storageFilter === 'fridge' ? 'bg-background shadow text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Fridge ({coldActiveVials.length})
              </button>
              <button
                type="button"
                onClick={() => setStorageFilter('freezer')}
                className={`min-h-9 px-3 py-2 rounded-md transition-colors ${storageFilter === 'freezer' ? 'bg-background shadow text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Freezer ({coldDryVials.length})
              </button>
              {(roomTempActiveVials.length > 0 || roomTempDryVials.length > 0) && (
                <button
                  type="button"
                  onClick={() => setStorageFilter('room_temp')}
                  className={`min-h-9 px-3 py-2 rounded-md transition-colors ${storageFilter === 'room_temp' ? 'bg-background shadow text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Room Temp ({roomTempActiveVials.length + roomTempDryVials.length})
                </button>
              )}
            </div>
          </div>

          {/* Refrigerator Section */}
          {(storageFilter === 'all' || storageFilter === 'fridge') && (
            <section className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Thermometer className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-foreground">Refrigerator (Active Vials)</h2>
                <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                  {coldActiveVials.length}
                </span>
              </div>
              <VialInventory vials={coldActiveVials} isRoomTemp={false} />
            </section>
          )}

          {/* Freezer Section */}
          {(storageFilter === 'all' || storageFilter === 'freezer') && (
            <section className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Snowflake className="h-5 w-5 text-sky-400" />
                <h2 className="text-lg font-bold text-foreground">Freezer (Dry Vials)</h2>
                <span className="text-xs bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full font-semibold">
                  {coldDryVials.length}
                </span>
              </div>
              <DryInventoryList
                vials={coldDryVials}
                compounds={compounds}
                syringeStandard={syringeStandard}
                syringeSize={syringeSize}
                onReconstitute={setReconstitutingVial}
                isRoomTemp={false}
              />
            </section>
          )}

          {/* Room Temp Opened Section */}
          {(storageFilter === 'all' || storageFilter === 'room_temp') && (roomTempActiveVials.length > 0 || roomTempDryVials.length > 0) && (
            <section className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Thermometer className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-foreground">Room Temp (Opened Vials)</h2>
                <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                  {roomTempActiveVials.length}
                </span>
              </div>
              <VialInventory vials={roomTempActiveVials} isRoomTemp={true} />
            </section>
          )}

          {/* Room Temp Unopened Section */}
          {(storageFilter === 'all' || storageFilter === 'room_temp') && (roomTempActiveVials.length > 0 || roomTempDryVials.length > 0) && (
            <section className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Thermometer className="h-5 w-5 text-amber-500 animate-pulse" />
                <h2 className="text-lg font-bold text-foreground">Room Temp (Unopened Vials)</h2>
                <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                  {roomTempDryVials.length}
                </span>
              </div>
              <DryInventoryList
                vials={roomTempDryVials}
                compounds={compounds}
                syringeStandard={syringeStandard}
                syringeSize={syringeSize}
                onReconstitute={setReconstitutingVial}
                isRoomTemp={true}
              />
            </section>
          )}
        </div>
      )}

      {/* Standalone Calculator Section */}
      <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden transition-all duration-300">
        <div
          onClick={() => setCalculatorExpanded(!calculatorExpanded)}
          className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/10 select-none transition-colors"
        >
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-bold text-foreground">Standalone Calculator</h2>
            {!calculatorExpanded && (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                Click to expand
              </span>
            )}
          </div>
          <div className="text-muted-foreground">
            {calculatorExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {calculatorExpanded && (
          <div className="px-6 pb-6 border-t border-border pt-4 animate-fade-in">
            <ReconstitutionCalculatorForm
              compounds={compounds}
              initialSyringeStandard={syringeStandard}
              initialSyringeSize={syringeSize}
            />
          </div>
        )}
      </section>

      {/* Modals */}
      {showAddDryModal && (
        <AddDryVialsModal
          compounds={compounds}
          initialCompoundId={addDryCompoundId}
          onSuccess={() => playSoundEffect('swoosh')}
          onClose={() => setShowAddDryModal(false)}
        />
      )}

      {showAddActiveModal && (
        <AddActiveVialModal
          compounds={compounds}
          onSuccess={() => playSoundEffect('chime')}
          onClose={() => setShowAddActiveModal(false)}
        />
      )}

      {reconstitutingVial && (
        <ReconstituteModal
          vial={reconstitutingVial}
          compounds={compounds}
          initialSyringeStandard={syringeStandard}
          initialSyringeSize={syringeSize}
          onSuccess={() => playSoundEffect('chime')}
          onClose={() => setReconstitutingVial(null)}
        />
      )}
    </div>
  );
}
