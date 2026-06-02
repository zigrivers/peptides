# Tracker "Units to Draw" + Compound Inventory View — Design Spec

**Status:** Approved design, hardened after a multi-model review (architecture, risk/safety, completeness lenses). Sections 1–7 cover the Tracker "units to draw" feature; sections 8+ extend it with a compound-grouped inventory view on the reconstitution page (same vial/units foundation).
**Date:** 2026-06-02
**Related:** `lib/reconstitution/domain/ReconstitutionCalculator.ts`, `lib/reconstitution/domain/syringe.ts`, `lib/tracker/application/{BatchLogService,DoseLogService}.ts`, `app/actions/reconstitution/reorder-vials.ts`, `docs/adrs/ADR-008-testing-strategy.md`, `.claude/rules/safety-math.md`

> **Review note:** the first draft proposed "selecting a vial = move it to the front of the shelf (`shelfOrder`)". The review proved that unsound — `shelfOrder` is a **global, per-user, densely-renumbered** index owned by an existing drag-to-reorder feature (`reorderVialsAction`), not a per-compound FIFO tiebreak. This spec instead uses an **explicit active-vial pointer** plus a shared `resolveActiveVial` resolver used by every consumer.

## 1. Problem & Goal

The Tracker shows a scheduled dose as a mass (e.g. `1 mg`), but the user must draw that
dose on an insulin syringe and has no idea how many **units** to pull. We will show, next
to each **scheduled** dose, the units to draw — derived from the subject's syringe standard
(default **U-100**) and the **reconstituted vial they are actually drawing from**.

Worked example (the reported case): `1 mg` from a 20 mg vial + 2 mL BAC water = 10 mg/mL →
0.1 mL → **10 units (U-100)** (4 units on U-40).

## 2. Decisions (resolved during brainstorming)

| Question | Decision |
|----------|----------|
| Where to show units | Calendar day-panel/tooltip, protocol detail page, batch-log review. **(Dashboard "due today" is NOT a surface — see §3.3.)** |
| Display format | Inline with standard: `1 mg  ≈ 10 units (U-100)`. |
| Multiple reconstituted vials | User selects the "drawing from" vial per compound; default = `resolveActiveVial` (§3.2). Selector shown only when ≥2 reconstituted vials exist. |
| Selection ↔ logging | The selected vial drives both the displayed units and the vial deducted on log, via the shared `resolveActiveVial` used by display **and both** log paths (§3.2). |
| No active reconstituted vial (mcg/mg dose) | Accurate-only: show `1 mg · reconstitute to see units`. Never estimate a concentration. |
| Syringe standard | The **subject's** `User.syringeStandard` (default `U100`); managed users use their own. |

## 3. Architecture

### 3.1 Domain: the dose→units helper

A pure, **total** function (never throws) in `lib/reconstitution/domain` — `doseToSyringeUnits`:

```
doseToSyringeUnits(
  dose: DoseAmount,                                  // { amount: string, unit }
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: 'U100' | 'U40'
): { computable: true;  units: Decimal; injectionVolMl: Decimal }
 | { computable: false; reason: 'needs_vial' | 'invalid_input' }
```

- Accepts the vial's `totalMg`/`bacWaterMl` as **strings** and parses internally (matching
  `serializeVial`), so callers can pass `SerializedVialData` without re-parsing Decimals in
  client code.
- **Input guards (required — `ReconstitutionCalculator.calculate` THROWS on non-positive
  inputs):** if `amount ≤ 0`, or a needed concentration input (`totalMg`/`bacWaterMl`) is
  null/≤0, return `{ computable: false, reason: 'invalid_input' }` (or `needs_vial` when the
  concentration is simply absent). The helper must wrap/guard before delegating.
- **mcg / mg** → needs concentration. `mg→mcg ×1000`; delegates to `ReconstitutionCalculator`
  (`units = injectionVolMl / volPerUnit`). No concentration → `{ computable: false,
  reason: 'needs_vial' }`.
- **mL** → `units = mL / getVolumePerUnit(standard)`. No vial needed.
- **IU** → `units = amount`. No vial needed. **Convention:** this app defines 1 IU = 1
  syringe unit (`convertDoseToMg` uses the same `volPerUnit` factor for IU as
  `getVolumePerUnit`, so `units = (IU × f)/f = IU` for both standards). This is the app's
  internal convention and is **not** a pharmacological IU.

**Rounding / precision (safety):** the helper returns an **exact** `Decimal`. Display rounds
to **one decimal place** (`toFixed(1)`) to match the existing `SyringePreview` /
`ReconstitutionCalculatorForm` convention — do not introduce a second precision. **Inventory
deduction continues to use the exact `injectionVolMl`/mg (unchanged); never deduct a rounded
unit count.** A dose that lands between markings (e.g. 7.3 units) is shown as `≈ 7.3 units` —
the `≈` already signals approximation.

**Existing duplicate math (must be acknowledged, not ignored):** dose→volume/mg conversion is
already implemented in `serializeVial` (`VialService.ts`) and `InventoryService.convertDoseToMg`,
and the catalog planner (`DosingReconstitutionPlanner.tsx`) computes units inline. `doseToSyringeUnits`
is the **canonical path for new code**; migrating those three onto it is a **follow-up refactor**
(out of scope here). To prevent drift in the meantime, add a **parity test** asserting
`doseToSyringeUnits` agrees with `convertDoseToMg`/`ReconstitutionCalculator` on shared cases.

Also add `syringeMaxUnits(standard: 'U100'|'U40', size: '0.3'|'0.5'|'1.0'): number` to
`syringe.ts` (the capacity logic is currently duplicated inline in `ReconstitutionCalculatorForm`
and `SyringePreview`). The Tracker capacity check (§3.5) uses it; the two existing callsites
migrate to it as part of the follow-up. 100% branch coverage (`safety-math.md`).

### 3.2 "Drawing-from" vial: explicit pointer + shared resolver

**Schema:** add `Vial.isActiveForCompound Boolean @default(false)` (additive migration; no
backfill — `false` everywhere means "use FIFO").

**Resolver (single source of truth for "which vial"):**
```
resolveActiveVial(userId, compoundId, tx?): Vial | null
  // the RECONSTITUTED vial with isActiveForCompound = true for (userId, compoundId);
  // else FIFO fallback: orderBy [shelfOrder asc, expiresAt asc]; else null.
```
`resolveActiveVial` is used by **(a)** the display surfaces, **(b)** `BatchLogService` (replacing
its inline FIFO `findFirst`), and **(c)** the individual-log path: its callers pass
`resolveActiveVial(...).id` as `logDose`'s `vialId`. This closes the review gap that
`logDose` deducts a **caller-supplied** `vialId` and never ran FIFO — now display and **both**
log paths resolve the same vial, so the displayed units always match what is deducted.

**Selection action** — `setActiveVialAction(subjectUserId, compoundId, vialId)`:
- **Managed-user scoping (do NOT copy `reorderVialsAction`, which is actor-only):** resolve
  `subjectUserId` from the UI context and verify `actorUserId === subjectUserId` **or** the
  actor manages the subject (same `getManagedUserIds` check `logDose` uses).
- Validates the target with `updateMany({ where: { id: vialId, userId: subjectUserId,
  compoundId, status: 'RECONSTITUTED' }, ... })` (count-guarded, defence-in-depth — matches
  `reorderVialsAction`'s proven pattern).
- In **one transaction**: set the chosen vial `isActiveForCompound = true` and unset all other
  RECONSTITUTED siblings for `(subjectUserId, compoundId)` to `false`; write an `AuditEvent`
  (`actorUserId`, `subjectUserId`). This avoids the unbounded-drift / tie / race problems the
  `shelfOrder` approach had (no numeric index to drift; exactly one flag per compound).
- **New audit action:** add `'VIAL_SET_ACTIVE'` to the `AuditAction` closed union in
  `lib/audit/domain/AuditEvent.ts` (Reconstitution section). Use `withAudit` for compile-time
  enforcement. (`lib/reconstitution` and `lib/audit` both require 100% branch coverage.)
- **Reactivity:** the selector calls the action with `useTransition`; on success
  `router.refresh()` re-renders the server tree. Optimistic pre-refresh display is out of scope.

When the active vial depletes (`status → DEPLETED`), its flag no longer matches the
RECONSTITUTED filter, so `resolveActiveVial` falls back to FIFO automatically.

### 3.3 Data flow & display surfaces

Units are computed **server-side** (call `doseToSyringeUnits` with `resolveActiveVial` + the
subject's standard) and passed to client components as **display strings + a `computable`
flag** — client components never receive `Decimal`s.

Per-surface changes (all currently lack the needed data — enumerated so the plan is concrete):

- **`TrackerCalendar`** (`tracker/page.tsx` → component): page must fetch `syringeStandard`
  **and `syringeSize`** (it fetches neither today) and the active vial per compound; add props
  (e.g. `syringeStandard`, `activeVialByCompoundId`, and the per-compound reconstituted-vial
  list where the selector renders). Day-panel + tooltip render `≈ N units (U-100)` or the
  `· reconstitute to see units` affordance. **Scope:** units render for **scheduled
  (not-yet-logged)** doses. For already-**logged** doses, units (if shown) use the stored
  `DoseLog.vialId` (historical accuracy), not the current active vial; logged-dose units are
  out of P1 scope.
- **Protocol detail page** (`protocols/[id]/page.tsx`): fetches no vials/standard today — add
  the `syringeStandard`/`syringeSize` + active-vial queries; render units next to the dose.
- **`BatchLogReview`**: `SerializedBatchDueItem` carries `availableVials: number` (a count) —
  extend it (or `getDueTodayForBatch`) to carry the active vial / precomputed `doseUnitsText`
  so each row shows units before confirming.
- **Dashboard "due today" — REMOVED from scope:** `StackOverview` renders only a boolean
  "dose today" + a link to the tracker; there are no per-dose rows to annotate. Adding them is
  net-new UI, explicitly out of scope.

The per-compound **"drawing from [Vial ▾]" selector** renders only when ≥2 RECONSTITUTED vials
exist for the compound. **Option label format:** `"{totalMg} mg · recon {reconDate} ·
{remainingMg} mg left (exp {expDate})"` (the Vial model has no user label; build from
`SerializedVialData`). Changing it calls `setActiveVialAction`; units re-render.

### 3.4 Format & copy

- Computable: `1 mg  ≈ 10 units (U-100)` (units muted/secondary; `(U-100)` = subject's standard).
- mcg/mg dose, no active vial: `1 mg  · reconstitute to see units`.
- mL/IU dose: units always computable for display. **But logging an mL/IU dose still needs a
  reconstituted vial** (`convertDoseToMg` requires concentration to deduct mg), and you always
  draw from a vial regardless — so with no active vial, show the units **and** the
  `· reconstitute to log` affordance, to avoid a "looks ready, log fails" split-brain.

### 3.5 Safety guardrails

- **Insufficient inventory:** when the active vial's `remainingMg < dose`
  (`serializeVial.insufficientMedication`), still show the full-dose units **plus** a warning of
  how much is actually drawable (e.g. `⚠ only ~5 units left in this vial`) — never silently show
  a full dose the vial can't provide.
- **Capacity overflow:** if the dose needs more units than `syringeMaxUnits(standard, size)`,
  warn (consistent with the catalog planner's overflow alert + `WarningPolicy`). Requires the
  page to fetch `syringeSize` (§3.3).
- **Expiry bypass (waste):** if `setActiveVialAction` promotes a vial that is **not** the
  soonest-expiring RECONSTITUTED vial for the compound, surface a confirmation that the
  sooner-expiring vial may expire unused (reuses the `EXPIRING_SOON` 7-day threshold).

## 4. Testing

- **`doseToSyringeUnits`** (100% branch): each unit (`mcg`, `mg`, `mL`, `IU`) × U-100/U-40;
  `needs_vial` (null concentration, mcg/mg); `invalid_input` (amount ≤ 0; `bacWaterMl` ≤ 0/null
  when needed); the reported `1 mg / 20 mg / 2 mL → 10 units (U-100), 4 units (U-40)` case; a
  vial passed for mL/IU is **ignored**. Plus the **parity test** vs.
  `convertDoseToMg`/`ReconstitutionCalculator`.
- **`syringeMaxUnits`** (100% branch): all `(standard, size)` pairs incl. U-40 0.3 mL = 12.
- **`resolveActiveVial`**: pointer hit; FIFO fallback when no flag; null when no RECONSTITUTED
  vial; ignores DEPLETED/EXPIRED.
- **`setActiveVialAction`**: sets one flag + unsets siblings in a transaction; rejects vials not
  owned by the subject / not RECONSTITUTED / wrong compound; manager-of-subject allowed,
  unrelated actor rejected; writes `VIAL_SET_ACTIVE` audit; idempotent.
- **Components**: units render on each surface; no-vial affordance for mcg/mg without inventory;
  mL/IU show units + `reconstitute to log` when no vial; selector appears only with ≥2 vials and
  re-renders units on change; insufficient/capacity/expiry warnings render.

## 5. Phased implementation

- **Phase 1 (display, FIFO):** `doseToSyringeUnits` + `syringeMaxUnits` (domain + tests);
  `resolveActiveVial` (FIFO-only, no pointer yet) wired into **display, `BatchLogService`, and
  the individual-log callers** so display == log from day one; units + no-vial affordance on the
  three surfaces; Tracker/protocol pages fetch `syringeStandard` + `syringeSize`.
- **Phase 2 (selection + warnings):** `Vial.isActiveForCompound` migration; `resolveActiveVial`
  honors the pointer; `setActiveVialAction` (+ `VIAL_SET_ACTIVE` audit, subject scoping); the
  per-compound selector (≥2 vials, option labels, reactivity); insufficient / capacity / expiry
  warnings.

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Displayed units differ from the deducted vial | `resolveActiveVial` is the single "which vial" source for display **and both** log paths (§3.2). |
| `shelfOrder` overload (original design) | Abandoned; replaced by an explicit `isActiveForCompound` flag — no global index, no drift/ties/renumber collisions. |
| Helper throws on zero/invalid inputs | Helper is total: guards amount/concentration > 0, maps to `invalid_input`/`needs_vial` (§3.1). |
| No rounding rule → unreadable units | Exact Decimal internally; display `toFixed(1)` (app convention); deduction uses exact volume (§3.1). |
| Capacity logic duplicated/untested | New `syringeMaxUnits` domain fn, 100% covered; callsites migrate (§3.1). |
| IU/mL "looks loggable" with no vial | Show units + `reconstitute to log`; logging requires a vial (§3.4). |
| Managed-user: wrong user's vial changed | `setActiveVialAction` resolves subject + manager check; query scoped to subject (§3.2). |
| Audit/typecheck on new action | `VIAL_SET_ACTIVE` added to the closed `AuditAction` union; `withAudit` enforces (§3.2). |
| Insufficient inventory shows full dose silently | Show full-dose units + drawable-amount warning (§3.5). |
| Promoting a fresh vial wastes an expiring one | Expiry-bypass confirmation (§3.5). |
| Unit math drift (3 existing impls) | `doseToSyringeUnits` canonical for new code; parity test; existing paths migrated in follow-up (§3.1). |

## 7. Open questions (for the implementation plan)

- Whether to also show units on already-**logged** dose rows (using `DoseLog.vialId`); currently
  scoped out of P1.
- Exact selector option-label wording and truncation on narrow viewports.
- Whether the expiry-bypass confirmation (§3.5) is a blocking modal or an inline note.

---

# Part II — Compound Inventory View

## 8. Problem & Goal

The reconstitution page lists the user's vials organized by **storage** (fridge =
reconstituted, freezer = dry), but there is no way to see inventory **by compound** —
"what do I have, how much is left, what's running low/expiring, and what don't I have?"
We add a **compound-grouped, filterable inventory view** to the reconstitution page.

## 9. Decisions (resolved during brainstorming)

| Question | Decision |
|----------|----------|
| Placement | **Extend the reconstitution page** with a **By storage ↔ By compound** view toggle (keep the existing fridge/freezer storage view; add the compound-grouped view). Not the Catalog. |
| What counts as inventory | Both **dry** and **reconstituted** vials, as **separately filterable** states. **EXPIRED** vials are *shown* (so they don't silently vanish) but excluded from doses-left math; DEPLETED/DELETED excluded entirely. |
| Filtering | Tri-state **All / In inventory / Not in inventory**, plus independent attention chips: **Ready (reconstituted)**, **Dry only**, **Expiring soon**, **Low**. |
| Subject | **Actor's own inventory** (v1), matching the reconstitution page today; managed-user subject deferred. |

## 10. Architecture

### 10.1 Data: one new scoped aggregate, reusing existing primitives

Add **`getInventorySummaryByCompound(userId, protocols, syringeStandard)`** — it needs
`protocols` and `syringeStandard` (not just `userId`) because it calls `serializeVial(v, now,
activeProtocols, syringeStandard)` and computes doses-left; this mirrors how
`getSerializedVialsForCompound` already fetches/accepts them. Returns, per `compoundId` the user
holds vials for:
`{ reconstitutedCount, dryCount, expiredCount, totalReconstitutedRemainingMg, totalDryMg,
worstBadge, activeVial: SerializedVialData | null, dryVialRefs, hasMixedConcentration,
dosesLeft, unitsEach | 'varies' | null }`.

- **Query:** one `vial.findMany({ where: { userId, status: { in: ['DRY','RECONSTITUTED',
  'EXPIRED'] } }, include: { compound }, take: 500 }, orderBy: [...] })` reduced in memory by
  `compoundId`. DEPLETED/DELETED excluded. **EXPIRED is included** (display only — §10.4) so a
  compound row doesn't disappear the moment the expiry cron flips a vial's status. A `take: 500`
  cap bounds the result (mirrors `reorderVialsAction`'s 50-cap philosophy; log if hit).
- **Additive, not consolidating:** this does **not** replace `getVialsForUser` /
  `getDryVialsForUser` (single-status, separately ordered — the storage view still uses them).
  It is a third query and is near-identical in shape to `getSerializedVialsForCompound` but
  un-scoped to a single compound. Extract a shared helper if practical.
- **`worstBadge` severity ordering (must be explicit):** `EXPIRED` > `EXPIRING_SOON` >
  `LOW_INVENTORY`. The most-severe badge across the compound's vials is shown.
- **`hasMixedConcentration`:** true when `reconstitutedCount > 1` and `totalMg/bacWaterMl` differs
  across the compound's reconstituted vials — drives the units-each suppression in §10.4.

The **"Not in inventory / All"** views need the global compound list. The reconstitution page
**already fetches** the published compounds list (`listCompounds()`, exempt/global) for the
calculator picker, so it is **joined in the page** with the `userId`-scoped aggregate — never in
one query (identity-scoping preserved). The not-in-inventory rows only need `id/name/slug` —
use the minimal compound fields (avoid shipping the full `profile`+citations payload to the
client for compounds the user doesn't even have).

### 10.2 View, toggle & component surface

`ReconstitutionClient` (already `'use client'`) gains a **By storage / By compound** toggle in
local React state. **New props the server page must pass** (today the client receives only
`compounds`, `dryVials`, `activeVials`, `syringeStandard`, `syringeSize` — and `protocols` never
crosses to the client): add **`inventorySummary: CompoundInventorySummary[]`** (the §10.1 output,
fully serialized — strings only, units computed server-side per §3.3; client never gets
`Decimal`s). The existing `compounds` (`Pick<Compound,'id'|'name'|'slug'>`) is reused for the
not-in-inventory rows.

The By-compound view is a **new `CompoundInventoryView` component** rendering the filter bar
(§10.3) + compound rows (§10.4). `DryInventoryList` already groups dry vials by `compoundId` and
is the reference pattern to extract/share, not duplicate. `InventoryDashboard` (aggregate stats +
the Add-Dry/Add-Active action header) **remains visible in both modes**; its app-wide badge
counts overlapping the per-compound badges is an accepted, deferred-cleanup duplication.

### 10.3 Filters (local state, not URL)

Filter/chip state lives in **local `useState`** within `ReconstitutionClient` (this page uses
local state + `useEffect`, not `useSearchParams`; URL-param filters would need a server-shell
refactor — out of scope). The page's existing `?reconstitute=` deep-link param is unaffected.

- **Primary tri-state:** All / In inventory / Not in inventory. **Default = In inventory** (so the
  potentially-large not-in-inventory list only renders on explicit user action).
- **Attention chips** (independent, combinable; annotated with the statuses they span):
  - `Ready` — compound has a RECONSTITUTED vial.
  - `Dry only` — has DRY but no RECONSTITUTED.
  - `Expiring soon` — **any DRY or RECONSTITUTED** vial with the `EXPIRING_SOON` badge (the badge
    is computed for all vials).
  - `Low` — **any RECONSTITUTED** vial with `LOW_INVENTORY` (dry vials are sealed; "low" doesn't
    apply).
- A **client-side name search** box for the by-compound view (the reconstitution page has no
  search today, and "All"/"Not in inventory" can be long).
- **Sort:** needs-attention first (`worstBadge` severity), then alphabetical.

### 10.4 Per-compound row content

`BPC-157 · 1 ready · 1 dry · ~14 mg · ⚠ expiring soon · ≈ 14 doses left (≈ 10 units each)`

- Counts (reconstituted / dry; plus an **`expired` indicator** when `expiredCount > 0`, with a
  *discard* hint — EXPIRED vials are shown, not hidden), total remaining mg, the `worstBadge`.
- **Doses-left line — Phase 3b (requires units P1).** Phase 3a ships the **counts/mg row only**;
  the doses-left line is additive.
  - `dosesLeft = floor(totalReconstitutedRemainingMg / doseMg)`.
  - **`doseMg` is concentration-dependent for mL/IU doses.** Compute it via
    `convertDoseToMg(dose, activeVial, syringeStandard)` (the **same active vial** used for
    units), **not** `dose.amount` — otherwise an `10 IU` dose would be read as `10 mg` and report
    `1 dose` instead of ~28 (a ~28× error). For mcg/mg doses no vial is needed.
  - `unitsEach` from `doseToSyringeUnits` on the active vial (`resolveActiveVial`).
  - **Mixed concentration:** if `hasMixedConcentration`, **suppress `unitsEach`** and render
    `(units vary by vial — see tracker)`; the mg-based `dosesLeft` still shows.
  - **Planning-estimate copy (safety):** the units sub-line must be qualified as a *planning
    estimate*, not a draw instruction — e.g. tooltip/parenthetical
    "*estimate from your active vial — use the Tracker for the exact draw*".
  - **Omit the doses-left line** when: no ACTIVE protocol for the compound; **>1 ACTIVE protocol**
    (ambiguous representative dose — don't guess); no reconstituted vial; or a mL/IU dose with no
    active vial (concentration unavailable).
- **Row actions** wired to existing flows: **Reconstitute** opens the existing `ReconstituteModal`
  for the compound's oldest DRY vial (the summary carries `dryVialRefs` so the row resolves a
  concrete `SerializedVialData`); **Add vials** opens `AddDryVialsModal` pre-selected to the
  `compoundId`. Clicking the row → the compound detail page.
- **Not-in-inventory rows** (only under "All"/"Not in inventory") show a muted
  `— none in stock · Add` affordance. Excludes archived compounds.

### 10.5 — Empty / loading / modal hookup

- **Empty state** (no vials at all): the By-compound view shows a friendly "No inventory yet —
  add dry vials or reconstitute" with the same Add actions.
- **Loading/reactivity:** after a row action mutates inventory, `router.refresh()` re-renders the
  RSC tree (consistent with existing patterns). The storage↔compound toggle and filters are pure
  client state — no server round-trip.

### 10.6 Scoping, reuse, phasing

- **Scoping:** actor-only (v1); pure **read** path (no mutation → no audit event needed).
  Managed-user subject deferred.
- **Reuse:** `serializeVial`, `resolveActiveVial`, `doseToSyringeUnits`, `convertDoseToMg`, the
  badge thresholds (`EXPIRING_SOON` = 7 days, `LOW_INVENTORY` = 20%). The aggregate + the
  `CompoundInventoryView` component are the only new code.
- **Phasing:**
  - **Phase 3a:** the aggregate (counts/mg/badges), the toggle, `CompoundInventoryView`, filters,
    not-in-inventory rows, modal hookup — **no doses-left line** (ships independently of units P1).
  - **Phase 3b:** the doses-left line (`dosesLeft` + `unitsEach`), after tracker-units Phase 1.

## 11. Testing

- **`getInventorySummaryByCompound`** (100% branch per `safety-math.md`): groups by compound;
  DEPLETED/DELETED excluded; **EXPIRED included for display, excluded from doses-left**; a compound
  with **both DRY and RECONSTITUTED** accumulates counts correctly; `worstBadge` ordering
  (EXPIRED > EXPIRING_SOON > LOW_INVENTORY); `hasMixedConcentration` true/false; `totalRemaining =
  0` but `reconstitutedCount > 0` → `0 doses`; the `take: 500` cap. Doses-left branches:
  mcg/mg (no vial); **mL/IU with active vial** (uses `convertDoseToMg`); **mL/IU with no active
  vial → omit**; no ACTIVE protocol → omit; **>1 ACTIVE protocol → omit**; mixed-concentration →
  `unitsEach = 'varies'`.
- **Components**: each filter + chip combination; default = In inventory; not-in-inventory rows
  render only under the right filter and exclude archived; client-side search; the storage↔compound
  toggle; empty state; row actions open the correct existing modals.

## 12. Risks & mitigations (inventory)

| Risk | Mitigation |
|------|------------|
| mL/IU doses-left magnitude error (×10–100) | `doseMg` via `convertDoseToMg(dose, activeVial, standard)`, not `dose.amount`; omit if no active vial (§10.4). |
| Mixed-concentration `units each` silently wrong | Detect `hasMixedConcentration`; suppress units-each → `units vary by vial — see tracker` (§10.4). |
| Units read as a dosing instruction | Planning-estimate qualifier on the units sub-line (§10.4). |
| EXPIRED vials vanish post-cron | EXPIRED included in the row with a discard hint; excluded from doses-left (§9/§10.4). |
| Representative-dose ambiguity (multiple ACTIVE protocols) | Omit doses-left when >1 ACTIVE protocol (§10.4). |
| `worstBadge` ambiguity | Explicit severity ordering EXPIRED > EXPIRING_SOON > LOW_INVENTORY (§10.1). |
| Aggregate can't call `serializeVial` (needs protocols/standard) | Signature takes `(userId, protocols, syringeStandard)` (§10.1). |
| Not-in-inventory list too long / no search | Default filter = In inventory; client-side name search; exclude archived (§10.3/§10.4). |
| Unbounded vial query / heavy catalog payload | `take: 500` cap; minimal `id/name/slug` for not-in-inventory rows (§10.1). |
| Identity-scoping leak | Two separate queries; inventory `userId`-scoped, catalog exempt; joined only in the page (§10.1). |
| Coupling to unshipped units work | Phase 3a (counts/mg) ships without units P1; 3b adds doses-left (§10.6). |
| New-component / state ambiguity | `CompoundInventoryView`; local `useState` filters; `DryInventoryList` grouping reused (§10.2/§10.3). |

## 13. Open questions (inventory)

- Whether the By-compound view should become the default once it matures (v1: storage stays default).
- Exact placement of the doses-left / units-each sub-line on narrow viewports.
- Whether to add a managed-user subject selector to this view in a later phase.
