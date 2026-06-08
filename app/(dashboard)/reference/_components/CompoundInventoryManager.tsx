'use client';

import React, { useState, useTransition } from 'react';
import { Decimal } from 'decimal.js';
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
  fridgeShelfLifeMonths?: number | null;
  freezerShelfLifeMonths?: number | null;
  reconstitutedShelfLifeDays?: number | null;
}

export function CompoundInventoryManager({
  compoundId,
  compoundName,
  vials,
  fridgeShelfLifeMonths = 12,
  freezerShelfLifeMonths = 24,
  reconstitutedShelfLifeDays = 14,
}: Props) {
  const isRoomTempOnly = fridgeShelfLifeMonths === null && freezerShelfLifeMonths === null;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form toggle states
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormType, setAddFormType] = useState<'dry' | 'reconstituted'>('dry');

  // Inline action states
  const [mixingVialId, setMixingVialId] = useState<string | null>(null);
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [mixingReconstitutionDate, setMixingReconstitutionDate] = useState('');
  const [mixingExpiry, setMixingExpiry] = useState('');

  const [editingVialId, setEditingVialId] = useState<string | null>(null);
  const [editRemainingMg, setEditRemainingMg] = useState('');

  // Add form fields
  const [totalMg, setTotalMg] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [addBacWaterMl, setAddBacWaterMl] = useState('2.0');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expiresAt, setExpiresAt] = useState('');

  // Expiration calculation fields
  const [receivedDate, setReceivedDate] = useState('');
  const [reconstitutionDate, setReconstitutionDate] = useState('');
  const [storageMethod, setStorageMethod] = useState<'fridge' | 'freezer'>('freezer');

  const getTodayLocalDateStr = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateExpirationDate = (receivedDateStr: string, shelfLifeMonths: number | null): string => {
    if (!receivedDateStr || shelfLifeMonths === null) return '';
    const date = new Date(receivedDateStr + 'T12:00:00');
    if (isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + shelfLifeMonths);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateExpiryDays = (startDateStr: string, days: number | null): string => {
    if (!startDateStr || days === null) return '';
    const date = new Date(startDateStr + 'T12:00:00');
    if (isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getConcentrationDisplay = (mgStr: string, mlStr: string): string => {
    try {
      const mg = new Decimal(mgStr || '0');
      const ml = new Decimal(mlStr || '0');
      if (mg.lte(0) || ml.lte(0) || mg.isNaN() || ml.isNaN()) {
        return '0.00 mg/mL (0.0 mcg/Unit)';
      }
      const mgPerMl = mg.div(ml);
      const mcgPerUnit = mgPerMl.times(1000).div(100);
      return `${mgPerMl.toFixed(2)} mg/mL (${mcgPerUnit.toFixed(1)} mcg/Unit)`;
    } catch {
      return '0.00 mg/mL (0.0 mcg/Unit)';
    }
  };

  const handleReceivedDateChange = (val: string) => {
    setReceivedDate(val);
    const months = isRoomTempOnly ? null : (storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths);
    setExpiresAt(calculateExpirationDate(val, months));
  };

  const handleReconstitutionDateChange = (val: string) => {
    setReconstitutionDate(val);
    setExpiresAt(calculateExpiryDays(val, reconstitutedShelfLifeDays));
  };

  const handleMixingReconstitutionDateChange = (val: string) => {
    setMixingReconstitutionDate(val);
    setMixingExpiry(calculateExpiryDays(val, reconstitutedShelfLifeDays));
  };

  const handleStorageMethodChange = (val: 'fridge' | 'freezer') => {
    setStorageMethod(val);
    const months = isRoomTempOnly ? null : (val === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths);
    setExpiresAt(calculateExpirationDate(receivedDate, months));
  };

  const handleFormTypeChange = (type: 'dry' | 'reconstituted') => {
    setAddFormType(type);
    const today = getTodayLocalDateStr();
    if (type === 'dry') {
      const months = isRoomTempOnly ? null : (storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths);
      setExpiresAt(calculateExpirationDate(receivedDate || today, months));
    } else {
      setExpiresAt(calculateExpiryDays(reconstitutionDate || today, reconstitutedShelfLifeDays));
    }
  };

  React.useEffect(() => {
    const today = getTodayLocalDateStr();
    setReceivedDate(today);
    setReconstitutionDate(today);
    const months = isRoomTempOnly ? null : (storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths);
    setExpiresAt(calculateExpirationDate(today, months));
  }, [fridgeShelfLifeMonths, freezerShelfLifeMonths, isRoomTempOnly]);

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
        cost: cost || undefined,
        currency: cost ? currency : undefined,
        expiresAt: expiresAt || undefined,
      });

      if (res.ok) {
        setSuccess(`Successfully added ${quantity} dry vial(s).`);
        setTotalMg('');
        setQuantity('1');
        setCost('');
        const today = getTodayLocalDateStr();
        setReceivedDate(today);
        const months = isRoomTempOnly ? null : (storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths);
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
        cost: cost || undefined,
        currency: cost ? currency : undefined,
        expiresAt: expiresAt || undefined,
      });

      if (res.ok) {
        setSuccess('Successfully added reconstituted vial.');
        setTotalMg('');
        setAddBacWaterMl('2.0');
        setCost('');
        const today = getTodayLocalDateStr();
        setReconstitutionDate(today);
        setExpiresAt(calculateExpiryDays(today, reconstitutedShelfLifeDays));
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
              onClick={() => handleFormTypeChange('dry')}
              className={`pb-2 px-1 text-xs font-bold border-b-2 transition-all ${
                addFormType === 'dry' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              {isRoomTempOnly ? 'Unopened Vial' : 'Dry Vials (Powder)'}
            </button>
            <button
              onClick={() => handleFormTypeChange('reconstituted')}
              className={`pb-2 px-1 text-xs font-bold border-b-2 transition-all ${
                addFormType === 'reconstituted' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              {isRoomTempOnly ? 'Opened Vial (In Use)' : 'Reconstituted Vial (Liquid)'}
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
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">{isRoomTempOnly ? 'Vial Volume (mL)' : 'BAC Water (ml)'}</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder={isRoomTempOnly ? 'e.g. 10.0' : 'e.g. 2.0'}
                    value={addBacWaterMl}
                    onChange={(e) => setAddBacWaterMl(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {addFormType === 'reconstituted' && totalMg && addBacWaterMl && (
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium bg-muted/30 p-2.5 rounded-lg border border-border/30 flex justify-between items-center" id="recon-concentration-display">
                <span>{isRoomTempOnly ? 'Vial Concentration:' : 'Reconstitution Concentration:'}</span>
                <span className="font-bold font-mono text-gray-700 dark:text-gray-300">
                  {getConcentrationDisplay(totalMg, addBacWaterMl)}
                </span>
              </div>
            )}

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
                  {isRoomTempOnly ? (
                    <select
                      value="room"
                      disabled
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent opacity-75"
                    >
                      <option value="room">Room Temp (20-25°C)</option>
                    </select>
                  ) : (
                    <select
                      value={storageMethod}
                      onChange={(e) => handleStorageMethodChange(e.target.value as 'fridge' | 'freezer')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                    >
                      <option value="freezer">Freezer (-20°C) — {freezerShelfLifeMonths}m</option>
                      <option value="fridge">Fridge (2-8°C) — {fridgeShelfLifeMonths}m</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            {addFormType === 'reconstituted' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    {isRoomTempOnly ? 'Puncture / Open Date' : 'Reconstitution Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={reconstitutionDate}
                    onChange={(e) => handleReconstitutionDateChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Expiration Date <span className="text-primary font-normal">(auto-populated)</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
              />
              {addFormType === 'dry' ? (
                isRoomTempOnly ? (
                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                    * Check the manufacturer expiration date printed on the vial.
                  </p>
                ) : (
                  receivedDate && (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">
                      * Calculated as {storageMethod === 'fridge' ? fridgeShelfLifeMonths : freezerShelfLifeMonths} months from received date based on {storageMethod} storage.
                    </p>
                  )
                )
              ) : (
                reconstitutionDate && (
                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                    * Calculated as {reconstitutedShelfLifeDays} days stability from {isRoomTempOnly ? 'puncture' : 'reconstitution'} date based on {isRoomTempOnly ? 'room temp' : 'refrigerated'} storage.
                  </p>
                )
              )}
            </div>

            {/* Cost and Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {addFormType === 'dry' ? 'Cost per Vial (Optional)' : 'Cost (Optional)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 45.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                >
                  <option value="USD">USD ($)</option>
                  <option value="USDT">USDT</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Processing...' : addFormType === 'dry' ? (isRoomTempOnly ? 'Add Unopened Vial' : 'Add Dry Vials') : (isRoomTempOnly ? 'Add Opened Vial' : 'Add Reconstituted Vial')}
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
            {isRoomTempOnly ? 'Unopened Vials' : 'Dry Vials (Powder)'} ({dryVials.length})
          </h3>
          {dryVials.length === 0 ? (
            <p className="text-xs text-muted-foreground italic mb-2">No {isRoomTempOnly ? 'unopened' : 'dry'} vials of this compound in stock.</p>
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
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">{isRoomTempOnly ? 'Vial Volume (mL)' : 'BAC Water (ml)'}</label>
                              <input
                                type="number"
                                step="any"
                                placeholder={isRoomTempOnly ? 'e.g. 10.0' : 'e.g. 2.0'}
                                value={bacWaterMl}
                                onChange={(e) => setBacWaterMl(e.target.value)}
                                className="w-full rounded px-2 py-1 bg-background border border-input text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">{isRoomTempOnly ? 'Opened On' : 'Reconstituted On'}</label>
                              <input
                                type="date"
                                value={mixingReconstitutionDate}
                                onChange={(e) => handleMixingReconstitutionDateChange(e.target.value)}
                                className="w-full rounded px-2 py-1 bg-background border border-input text-xs"
                              />
                            </div>
                          </div>
                          {bacWaterMl && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium bg-muted/30 p-2 rounded-lg border border-border/30 flex justify-between items-center" id={`vial-concentration-display-${vial.id}`}>
                              <span>{isRoomTempOnly ? 'Vial Concentration:' : 'Concentration:'}</span>
                              <span className="font-bold font-mono text-gray-700 dark:text-gray-300">
                                {getConcentrationDisplay(vial.totalMg, bacWaterMl)}
                              </span>
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                              Exp Date <span className="text-primary font-normal">(auto-populated)</span>
                            </label>
                            <input
                              type="date"
                              value={mixingExpiry}
                              onChange={(e) => setMixingExpiry(e.target.value)}
                              className="w-full rounded px-2 py-1 bg-background border border-input text-xs"
                            />
                            <p className="text-[9px] text-muted-foreground italic mt-0.5">
                              * Calculated as {reconstitutedShelfLifeDays} days stability from {isRoomTempOnly ? 'puncture' : 'reconstitution'}.
                            </p>
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => handleReconstitute(vial.id)}
                              className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                            >
                              {isRoomTempOnly ? 'Confirm Open' : 'Mix'}
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
                            setBacWaterMl(isRoomTempOnly ? '10.0' : '2.0');
                            const today = getTodayLocalDateStr();
                            setMixingReconstitutionDate(today);
                            setMixingExpiry(calculateExpiryDays(today, reconstitutedShelfLifeDays));
                          }}
                          className="w-full py-1 bg-secondary hover:bg-secondary-foreground/10 text-foreground border border-border rounded flex items-center justify-center gap-1 font-bold text-[10px]"
                        >
                          <Droplet className="h-3 w-3 text-sky-500" /> {isRoomTempOnly ? 'Open / Puncture' : 'Reconstitute'}
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
            {isRoomTempOnly ? 'Opened / Active Vials' : 'Active Vials (Reconstituted)'} ({activeVials.length})
          </h3>
          {activeVials.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No active {isRoomTempOnly ? 'opened' : 'reconstituted'} vials of this compound in use.</p>
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
                        <span>{isRoomTempOnly ? `Volume: ${vial.bacWaterMl} mL` : `Dilution: ${vial.bacWaterMl} ml BAC water`}</span>
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
