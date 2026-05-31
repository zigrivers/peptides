'use client';

import React, { useState, useTransition } from 'react';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import {
  addDryVialsAction,
  addReconstitutedVialAction,
  reconstituteDryVialAction,
  deleteVialAction,
  updateVialRemainingMgAction,
} from '@/app/actions/reconstitution/inventory-actions';
import { ChevronUp, Plus, Trash2, Droplet, Check, AlertCircle, Edit2 } from 'lucide-react';
import { getCapColor } from '@/lib/reconstitution/domain/syringe';

interface Props {
  compoundId: string;
  compoundName: string;
  vials: SerializedVialData[];
  fridgeShelfLifeMonths?: number;
  freezerShelfLifeMonths?: number;
}

export function CompoundInventoryManager({
  compoundId,
  compoundName,
  vials,
  fridgeShelfLifeMonths = 12,
  freezerShelfLifeMonths = 24,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form toggle states
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormType, setAddFormType] = useState<'dry' | 'reconstituted'>('dry');

  // Inline action states
  const [mixingVialId, setMixingVialId] = useState<string | null>(null);
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [mixingExpiry, setMixingExpiry] = useState('');

  const [editingVialId, setEditingVialId] = useState<string | null>(null);
  const [editRemainingMg, setEditRemainingMg] = useState('');

  // Add form fields
  const [totalMg, setTotalMg] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [addBacWaterMl, setAddBacWaterMl] = useState('2.0');
  const [expiresAt, setExpiresAt] = useState('');

  // Expiration calculation fields
  const [receivedDate, setReceivedDate] = useState('');
  const [storageMethod, setStorageMethod] = useState<'fridge' | 'freezer'>('freezer');

  const getTodayLocalDateStr = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateExpirationDate = (receivedDateStr: string, shelfLifeMonths: number): string => {
    if (!receivedDateStr) return '';
    const date = new Date(receivedDateStr + 'T12:00:00');
    if (isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + shelfLifeMonths);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleReceivedDateChange = (val: string) => {
    setReceivedDate(val);
    const months = storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths;
    setExpiresAt(calculateExpirationDate(val, months));
  };

  const handleStorageMethodChange = (val: 'fridge' | 'freezer') => {
    setStorageMethod(val);
    const months = val === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths;
    setExpiresAt(calculateExpirationDate(receivedDate, months));
  };

  React.useEffect(() => {
    const today = getTodayLocalDateStr();
    setReceivedDate(today);
    const months = storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths;
    setExpiresAt(calculateExpirationDate(today, months));
  }, [fridgeShelfLifeMonths, freezerShelfLifeMonths]);

  // Segregate dry and active vials
  const dryVials = vials.filter((v) => v.status === 'DRY');
  const activeVials = vials.filter((v) => v.status === 'RECONSTITUTED');

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleAddDryVials = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    startTransition(async () => {
      const res = await addDryVialsAction({
        compoundId,
        totalMg,
        quantity: parseInt(quantity, 10),
        expiresAt: expiresAt || undefined,
      });

      if (res.ok) {
        setSuccess(`Successfully added ${quantity} dry vial(s).`);
        setTotalMg('');
        setQuantity('1');
        const today = getTodayLocalDateStr();
        setReceivedDate(today);
        const months = storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths;
        setExpiresAt(calculateExpirationDate(today, months));
        setShowAddForm(false);
      } else {
        setError(res.message || 'Failed to add dry vials.');
      }
    });
  };

  const handleAddReconstitutedVial = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    startTransition(async () => {
      const res = await addReconstitutedVialAction({
        compoundId,
        totalMg,
        bacWaterMl: addBacWaterMl,
        expiresAt: expiresAt || undefined,
      });

      if (res.ok) {
        setSuccess('Successfully added reconstituted vial.');
        setTotalMg('');
        setAddBacWaterMl('2.0');
        const today = getTodayLocalDateStr();
        setReceivedDate(today);
        const months = storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths;
        setExpiresAt(calculateExpirationDate(today, months));
        setShowAddForm(false);
      } else {
        setError(res.message || 'Failed to add reconstituted vial.');
      }
    });
  };

  const handleReconstitute = async (vialId: string) => {
    if (!bacWaterMl) {
      setError('Please specify BAC water amount.');
      return;
    }
    clearMessages();
    startTransition(async () => {
      const res = await reconstituteDryVialAction({
        vialId,
        bacWaterMl,
        expiresAt: mixingExpiry || undefined,
      });

      if (res.ok) {
        setSuccess('Vial successfully reconstituted.');
        setMixingVialId(null);
        setBacWaterMl('');
        setMixingExpiry('');
      } else {
        setError(res.message || 'Failed to reconstitute vial.');
      }
    });
  };

  const handleUpdateRemainingMg = async (vialId: string) => {
    if (editRemainingMg === '') return;
    clearMessages();
    startTransition(async () => {
      const res = await updateVialRemainingMgAction({
        vialId,
        remainingMg: editRemainingMg,
      });

      if (res.ok) {
        setSuccess('Vial remaining quantity updated.');
        setEditingVialId(null);
        setEditRemainingMg('');
      } else {
        setError(res.message || 'Failed to update vial quantity.');
      }
    });
  };

  const handleDeleteVial = async (vialId: string) => {
    if (!confirm('Are you sure you want to remove this vial from your inventory?')) return;
    clearMessages();
    startTransition(async () => {
      const res = await deleteVialAction(vialId);
      if (res.ok) {
        setSuccess('Vial removed.');
      } else {
        setError(res.message || 'Failed to delete vial.');
      }
    });
  };

  const BADGE_STYLES = {
    EXPIRED: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900/30',
    EXPIRING_SOON: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/30',
    LOW_INVENTORY: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900/30',
  };

  return (
    <section className="mt-8 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>📦</span> Inventory Manager
        </h2>
        <button
          onClick={() => {
            clearMessages();
            setShowAddForm(!showAddForm);
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 transition-all active:scale-95 shadow-sm"
        >
          {showAddForm ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? 'Close' : 'Add Vials'}
        </button>
      </div>

      {/* Add Vials Form Area */}
      {showAddForm && (
        <div className="mb-6 p-4 rounded-lg bg-secondary/50 border border-secondary shadow-inner animate-[slideDown_0.2s_ease-out] text-sm">
          <div className="flex gap-2 mb-4 border-b border-border pb-2">
            <button
              onClick={() => setAddFormType('dry')}
              className={`pb-2 px-1 text-xs font-bold border-b-2 transition-all ${
                addFormType === 'dry' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              Dry Vials (Powder)
            </button>
            <button
              onClick={() => setAddFormType('reconstituted')}
              className={`pb-2 px-1 text-xs font-bold border-b-2 transition-all ${
                addFormType === 'reconstituted' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              Reconstituted Vial (Liquid)
            </button>
          </div>

          <form onSubmit={addFormType === 'dry' ? handleAddDryVials : handleAddReconstitutedVial} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Strength (total mg)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 5"
                  value={totalMg}
                  onChange={(e) => setTotalMg(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                />
              </div>

              {addFormType === 'dry' ? (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">BAC Water (ml)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 2.0"
                    value={addBacWaterMl}
                    onChange={(e) => setAddBacWaterMl(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {addFormType === 'dry' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Received Date
                  </label>
                  <input
                    type="date"
                    required
                    value={receivedDate}
                    onChange={(e) => handleReceivedDateChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Storage Method
                  </label>
                  <select
                    value={storageMethod}
                    onChange={(e) => handleStorageMethodChange(e.target.value as 'fridge' | 'freezer')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  >
                    <option value="freezer">Freezer (-20°C) — {freezerShelfLifeMonths}m</option>
                    <option value="fridge">Fridge (2-8°C) — {fridgeShelfLifeMonths}m</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Expiration Date{' '}
                {addFormType === 'dry' ? (
                  <span className="text-primary font-normal">(auto-populated)</span>
                ) : (
                  <span className="text-muted-foreground font-normal">(optional)</span>
                )}
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
              />
              {addFormType === 'dry' && receivedDate && (
                <p className="mt-1 text-[11px] text-muted-foreground italic">
                  * Calculated as {storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths} months from received date based on {storageMethod} storage.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Processing...' : addFormType === 'dry' ? 'Add Dry Vials' : 'Add Reconstituted Vial'}
            </button>
          </form>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-950/30 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 text-xs flex items-start gap-2 animate-[slideDown_0.2s_ease-out]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-200 dark:border-emerald-950/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2 animate-[slideDown_0.2s_ease-out]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Current Vials List */}
      <div className="space-y-4">
        {/* Dry Vials Section */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Dry Vials ({dryVials.length})
          </h3>
          {dryVials.length === 0 ? (
            <p className="text-xs text-muted-foreground italic mb-2">No dry vials of this compound in stock.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dryVials.map((vial) => (
                <div
                  key={vial.id}
                  className="p-3 rounded-lg border border-border bg-secondary/20 flex flex-col justify-between text-xs transition-all relative overflow-hidden"
                >
                  {/* Visual Cap Indicator */}
                  <div
                    className="absolute top-0 left-0 bottom-0 w-1.5"
                    style={{ backgroundColor: getCapColor(compoundName) }}
                    title={`Cap color: ${compoundName}`}
                  />
                  <div className="pl-2 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm">{vial.totalMg} mg</span>
                      <button
                        onClick={() => handleDeleteVial(vial.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                        title="Delete vial"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      Exp: {vial.expiresAt ? new Date(vial.expiresAt).toLocaleDateString() : '—'}
                    </div>

                    {vial.badges.map((badge) => (
                      <span
                        key={badge}
                        className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${BADGE_STYLES[badge]}`}
                      >
                        {badge.replace('_', ' ')}
                      </span>
                    ))}

                    <div className="pt-2">
                      {mixingVialId === vial.id ? (
                        <div className="space-y-2 mt-1 border-t border-border pt-2">
                          <div>
                            <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">BAC Water (ml)</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="e.g. 2.0"
                              value={bacWaterMl}
                              onChange={(e) => setBacWaterMl(e.target.value)}
                              className="w-full rounded px-2 py-1 bg-background border border-input text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                              Exp Date <span className="font-normal text-muted-foreground">(optional)</span>
                            </label>
                            <input
                              type="date"
                              value={mixingExpiry}
                              onChange={(e) => setMixingExpiry(e.target.value)}
                              className="w-full rounded px-2 py-1 bg-background border border-input text-xs"
                            />
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleReconstitute(vial.id)}
                              className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                            >
                              Mix
                            </button>
                            <button
                              type="button"
                              onClick={() => setMixingVialId(null)}
                              className="px-2 py-1 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded text-[10px] font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            clearMessages();
                            setMixingVialId(vial.id);
                            setBacWaterMl('2.0');
                          }}
                          className="w-full py-1 bg-secondary hover:bg-secondary-foreground/10 text-foreground border border-border rounded flex items-center justify-center gap-1 font-bold text-[10px]"
                        >
                          <Droplet className="h-3 w-3 text-sky-500" /> Reconstitute
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reconstituted Vials Section */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Active Vials ({activeVials.length})
          </h3>
          {activeVials.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No active vials of this compound in use.</p>
          ) : (
            <div className="space-y-2">
              {activeVials.map((vial) => {
                const total = parseFloat(vial.totalMg);
                const remaining = parseFloat(vial.remainingMg);
                const progress = total > 0 ? (remaining / total) * 100 : 0;

                return (
                  <div
                    key={vial.id}
                    className="p-3.5 rounded-lg border border-border bg-secondary/10 relative overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    {/* Visual Cap Color */}
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1.5"
                      style={{ backgroundColor: getCapColor(compoundName) }}
                    />

                    <div className="pl-3 flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">
                          {vial.remainingMg} mg <span className="text-[10px] font-normal text-muted-foreground">/ {vial.totalMg} mg left</span>
                        </span>
                        {vial.badges.map((badge) => (
                          <span
                            key={badge}
                            className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${BADGE_STYLES[badge]}`}
                          >
                            {badge.replace('_', ' ')}
                          </span>
                        ))}
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                        <span>Dilution: {vial.bacWaterMl} ml BAC water</span>
                        <span>•</span>
                        <span>Exp: {vial.expiresAt ? new Date(vial.expiresAt).toLocaleDateString() : '—'}</span>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex items-center gap-2">
                      {editingVialId === vial.id ? (
                        <div className="flex items-center gap-1 text-xs">
                          <input
                            type="number"
                            step="any"
                            placeholder="Mg"
                            value={editRemainingMg}
                            onChange={(e) => setEditRemainingMg(e.target.value)}
                            className="w-16 rounded border border-input px-1.5 py-1 bg-background text-xs"
                          />
                          <button
                            onClick={() => handleUpdateRemainingMg(vial.id)}
                            className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            title="Confirm edit"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingVialId(null)}
                            className="px-1.5 py-1 bg-secondary text-foreground border border-border rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              clearMessages();
                              setEditingVialId(vial.id);
                              setEditRemainingMg(vial.remainingMg);
                            }}
                            className="p-1.5 bg-secondary hover:bg-secondary-foreground/10 text-foreground border border-border rounded-lg flex items-center gap-1 text-[10px] font-bold"
                            title="Edit quantity"
                          >
                            <Edit2 className="h-3 w-3" /> Edit Mg
                          </button>
                          <button
                            onClick={() => handleDeleteVial(vial.id)}
                            className="p-1.5 bg-secondary hover:bg-red-500/10 hover:text-red-500 text-muted-foreground border border-border rounded-lg"
                            title="Delete vial"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
