import Decimal from 'decimal.js';
import { buildDoseUnitsDisplay, doseToSyringeUnits } from './doseUnits';
import type { SyringeStandard, SyringeSize } from './doseUnits';
import { syringeMaxUnits } from './syringe';
import type { DoseAmount } from '@/lib/tracker/domain/types';

/**
 * Minimum syringe units that are reasonably measurable by hand. Below this the
 * plunger gradations are too coarse to draw precisely, so we suggest more BAC water.
 */
const MIN_PULLABLE_UNITS = new Decimal(5);
/**
 * Target units for the typical dose when suggesting a BAC volume — a comfortable
 * mid-syringe draw that's easy to read.
 */
const TARGET_TYPICAL_UNITS = new Decimal(20);
/** Suggested BAC volume is rounded to the nearest half-mL and clamped to this range. */
const SUGGESTED_ML_MIN = new Decimal('0.5');
const SUGGESTED_ML_MAX = new Decimal(10);
const HALF = new Decimal('0.5');

export type ReconPreviewRow = {
  label: 'Conservative' | 'Typical' | 'Aggressive';
  doseText: string; // "500 mcg"
  unitsText: string | null; // from buildDoseUnitsDisplay
  exceedsSyringe: boolean; // true when that row's buildDoseUnitsDisplay returned a warning
};

export type ReconstitutionPreview = {
  computable: boolean;
  concentrationText: string | null; // "10 mg in 2 mL (5 mg/mL)"
  rows: ReconPreviewRow[];
  hint: string | null;
  warning: string | null;
};

const NOT_COMPUTABLE: ReconstitutionPreview = {
  computable: false,
  concentrationText: null,
  rows: [],
  hint: null,
  warning: null,
};

function parsePositive(value: string): Decimal | null {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    return null;
  }
  if (!d.isFinite() || d.lte(0)) return null;
  return d;
}

/** Format with up to 2 decimals, trailing zeros trimmed (5, 3.33, 2.5 — not 5.00). */
function formatMgPerMl(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

/**
 * Pure helper that turns a compound's 3 dosing ranges + a vial's reconstitution
 * (totalMg / bacWaterMl) + the user's syringe settings into a render-ready preview:
 * one row per range (units to draw), a concentration string, an optional
 * "suggested BAC volume" hint when the typical dose is too small to measure, and an
 * optional syringe-capacity warning. Total — NEVER throws (safety-math).
 */
export function buildReconstitutionPreview(input: {
  ranges: { low: DoseAmount; typical: DoseAmount; high: DoseAmount } | null;
  totalMg: string;
  bacWaterMl: string;
  syringeStandard: SyringeStandard;
  syringeSize?: SyringeSize;
}): ReconstitutionPreview {
  const { ranges, totalMg, bacWaterMl, syringeStandard, syringeSize } = input;

  if (ranges === null) return NOT_COMPUTABLE;

  const totalMgDec = parsePositive(totalMg);
  const bacWaterMlDec = parsePositive(bacWaterMl);
  if (totalMgDec === null || bacWaterMlDec === null) return NOT_COMPUTABLE;

  const vialConcentration = { totalMg, bacWaterMl };

  const mgPerMl = totalMgDec.dividedBy(bacWaterMlDec);
  const concentrationText = `${totalMgDec.toString()} mg in ${bacWaterMlDec.toString()} mL (${formatMgPerMl(mgPerMl)} mg/mL)`;

  const rowDefs: Array<{ label: ReconPreviewRow['label']; dose: DoseAmount }> = [
    { label: 'Conservative', dose: ranges.low },
    { label: 'Typical', dose: ranges.typical },
    { label: 'Aggressive', dose: ranges.high },
  ];

  const rows: ReconPreviewRow[] = rowDefs.map(({ label, dose }) => {
    const display = buildDoseUnitsDisplay(dose, vialConcentration, syringeStandard, syringeSize);
    return {
      label,
      doseText: `${dose.amount} ${dose.unit}`,
      unitsText: display.unitsText,
      exceedsSyringe: display.warning != null,
    };
  });

  const hint = buildHint(ranges.typical, vialConcentration, bacWaterMlDec, syringeStandard);
  const warning = buildWarning(rowDefs, rows, vialConcentration, bacWaterMl, syringeStandard, syringeSize);

  return { computable: true, concentrationText, rows, hint, warning };
}

function buildHint(
  typical: DoseAmount,
  vialConcentration: { totalMg: string; bacWaterMl: string },
  bacWaterMlDec: Decimal,
  syringeStandard: SyringeStandard
): string | null {
  // The "add more BAC water" suggestion only makes sense for mass doses (mcg/mg),
  // where syringe units scale linearly with BAC volume. For IU and mL doses the units
  // are independent of vial concentration, so diluting further would NOT change the
  // units drawn — suggesting it would be actively wrong. Skip the hint for those.
  if (typical.unit !== 'mcg' && typical.unit !== 'mg') return null;

  const result = doseToSyringeUnits(typical, vialConcentration, syringeStandard);
  if (!result.computable) return null;

  const units = result.units;
  if (!units.lt(MIN_PULLABLE_UNITS)) return null;

  // suggestedMl = round(bac × (target / units) to nearest 0.5), clamped [0.5, 10].
  const raw = bacWaterMlDec.times(TARGET_TYPICAL_UNITS.dividedBy(units));
  let suggestedMl = raw.dividedBy(HALF).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(HALF);
  if (suggestedMl.lt(SUGGESTED_ML_MIN)) suggestedMl = SUGGESTED_ML_MIN;
  if (suggestedMl.gt(SUGGESTED_ML_MAX)) suggestedMl = SUGGESTED_ML_MAX;

  if (suggestedMl.equals(bacWaterMlDec)) return null;

  const unitsAtSuggested = units.times(suggestedMl).dividedBy(bacWaterMlDec);
  return `💡 At ${vialConcentration.bacWaterMl} mL the typical dose is only ${units.toFixed(1)}u — hard to measure precisely. Try ~${suggestedMl} mL → ~${unitsAtSuggested.toFixed(1)}u.`;
}

function buildWarning(
  rowDefs: Array<{ label: ReconPreviewRow['label']; dose: DoseAmount }>,
  rows: ReconPreviewRow[],
  vialConcentration: { totalMg: string; bacWaterMl: string },
  bacWaterMl: string,
  syringeStandard: SyringeStandard,
  syringeSize?: SyringeSize
): string | null {
  if (!syringeSize) return null;

  // Among rows that exceed the syringe, pick the one with the highest units.
  // `exceedsSyringe` is only ever set when buildDoseUnitsDisplay attached a warning,
  // which it does solely on a computable result — so doseToSyringeUnits is computable
  // for every offending row here.
  let worst: { label: ReconPreviewRow['label']; units: Decimal } | null = null;
  rowDefs.forEach(({ label, dose }, index) => {
    if (!rows[index].exceedsSyringe) return;
    const result = doseToSyringeUnits(dose, vialConcentration, syringeStandard);
    /* c8 ignore next */
    if (!result.computable) return;
    if (worst === null || result.units.gt(worst.units)) {
      worst = { label, units: result.units };
    }
  });

  if (worst === null) return null;

  const { label, units } = worst as { label: ReconPreviewRow['label']; units: Decimal };
  const max = syringeMaxUnits(syringeStandard, syringeSize);
  return `⚠ At ${bacWaterMl} mL the ${label} dose (${units.toFixed(1)}u) exceeds your ${max}-unit syringe — consider less BAC water.`;
}
