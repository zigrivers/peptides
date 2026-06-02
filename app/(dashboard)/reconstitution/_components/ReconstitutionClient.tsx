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
import { Snowflake, Thermometer, Calculator, Boxes, LayoutGrid } from 'lucide-react';
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
  const [showAddDryModal, setShowAddDryModal] = useState(false);
  const [addDryCompoundId, setAddDryCompoundId] = useState<string | undefined>(undefined);
  const [showAddActiveModal, setShowAddActiveModal] = useState(false);
  const [reconstitutingVial, setReconstitutingVial] = useState<SerializedVialData | null>(null);
  
  // Persistent sound effects active state (safely hydrated on mount to avoid Next.js hydration differences)
  const [isMounted, setIsMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

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
        dryVials={dryVials}
        activeVials={activeVials}
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
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('storage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${viewMode === 'storage' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
          >
            <LayoutGrid className="h-4 w-4" /> By storage
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compound')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${viewMode === 'compound' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
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
        <>
      {/* Refrigerator Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Thermometer className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-bold text-foreground">Refrigerator (Active Vials)</h2>
          <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
            {activeVials.length}
          </span>
        </div>
        <VialInventory vials={activeVials} />
      </section>

      {/* Freezer Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Snowflake className="h-5 w-5 text-sky-400" />
          <h2 className="text-lg font-bold text-foreground">Freezer (Dry Vials)</h2>
          <span className="text-xs bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full font-semibold">
            {dryVials.length}
          </span>
        </div>
        <DryInventoryList
          vials={dryVials}
          compounds={compounds}
          syringeStandard={syringeStandard}
          syringeSize={syringeSize}
          onReconstitute={setReconstitutingVial}
        />
      </section>
        </>
      )}

      {/* Standalone Calculator Section */}
      <section className="space-y-4 rounded-xl border border-border bg-card text-card-foreground px-6 py-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Calculator className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-foreground">Standalone Calculator</h2>
        </div>
        <ReconstitutionCalculatorForm
          compounds={compounds}
          initialSyringeStandard={syringeStandard}
          initialSyringeSize={syringeSize}
        />
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
