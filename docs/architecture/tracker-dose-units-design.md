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
// DoseAmount = the tracker type: lib/tracker/domain/types.ts ({ amount: string, unit: DoseUnit })
// DoseUnit is the CLOSED union 'mcg'|'mg'|'IU'|'mL' — required so the exhaustive switch's
// default branch ('invalid_input') is reachable/testable. (Do NOT use the reference-domain
// DoseAmount, whose unit is a free string.)
doseToSyringeUnits(
  dose: DoseAmount,                                  // { amount: string, unit: DoseUnit }
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
  compound row doesn't disappear the moment the expiry cron flips a vial's status. `take: 500`
  is a **read-path safety cap that silently truncates** (logs if hit) — this is *not* the hard
  rejection `reorderVialsAction` uses for its 50-vial limit; different semantics, stated plainly.
- **EXPIRED badge derivation (gotcha):** `toVialWithBadges` computes the `EXPIRED` *badge* from
  `expiresAt < now`, **not** from `status === 'EXPIRED'`, and runs the `LOW_INVENTORY` branch for
  any non-DRY status. So an `EXPIRED`-status vial may not carry the `EXPIRED` badge. Therefore
  `worstBadge` must treat **`status === 'EXPIRED'` as EXPIRED-level directly** (don't rely on the
  badge alone). Confirm `serializeVial`/`toVialWithBadges` is safe to call on EXPIRED-status input
  (it is — it keys off `expiresAt`/`remainingMg`), but the row's expired indicator keys off
  `status`/`expiredCount`, not the badge.
- **Additive, not consolidating:** this does **not** replace `getVialsForUser` /
  `getDryVialsForUser` (single-status, separately ordered — the storage view still uses them).
  Near-identical in shape to `getSerializedVialsForCompound` but un-scoped to one compound.
- **`worstBadge` severity ordering (must be explicit):** `EXPIRED` (status or badge) >
  `EXPIRING_SOON` > `LOW_INVENTORY`.
- **`hasMixedConcentration`:** true when `reconstitutedCount > 1` and `totalMg/bacWaterMl` differs
  across the compound's reconstituted vials — drives §10.4 omission rules.

The **"Not in inventory / All"** views need the global compound list. **Correction to an earlier
draft:** the reconstitution page currently calls `listCompounds()` (full `Compound`, incl.
`profile`) and passes `Pick<Compound,'id'|'name'|'profile'|'slug'>` to `ReconstitutionClient`
(profile **is** already shipped). Two options, pick in the plan: (1) **reuse** that existing
prop for not-in-inventory rows (accept the already-shipped `profile`; zero new query — simplest),
or (2) add a separate `getCompoundsMinimal()` (`id/name/slug`) list for the not-in-inventory rows
and keep the `profile`-bearing prop only for the calculator picker. Either way the global query
stays exempt and is **joined in the page** with the `userId`-scoped aggregate (never one query).
The aggregate also **reuses the `protocols` array the page already fetches** (no redundant query).

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
  - **`doseMg` is concentration-dependent for mL/IU doses.** Compute it via the **real**
    signature `convertDoseToMg(new Decimal(dose.amount), dose.unit, { totalMg:
    new Decimal(activeVial.totalMg), bacWaterMl: activeVial.bacWaterMl ? new
    Decimal(activeVial.bacWaterMl) : null }, syringeStandard)` (it takes a `Decimal` amount + a
    separate `unit` + a Decimal-typed vial — **not** a `SerializedVialData`, and it **throws** on
    `bacWaterMl ≤ 0`, so the omit-guards below must run first). Using `dose.amount` as mg would
    read `10 IU` as `10 mg` → `1 dose` instead of ~28 (~28× error). For mcg/mg doses no vial is
    needed (`mcg→mg ÷1000`, `mg` as-is).
  - `unitsEach` from `doseToSyringeUnits` on the active vial (`resolveActiveVial`).
  - **Mixed concentration:** if `hasMixedConcentration`, **suppress `unitsEach`** → render
    `(units vary by vial — see tracker)`. The mg-based `dosesLeft` still shows **only for mcg/mg
    doses** (mass is concentration-independent). **For mL/IU doses with `hasMixedConcentration`,
    also OMIT `dosesLeft`** — the per-vial mg-equivalent differs, so a single mass pool ÷
    active-vial `doseMg` is wrong (e.g. could under/over-count by the concentration ratio).
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
| mL/IU doses-left magnitude error (×10–100) | `doseMg` via `convertDoseToMg` with the active vial (real 4-arg signature — §10.4), not `dose.amount`; omit if no active vial. |
| Mixed-concentration silently wrong | Suppress `unitsEach`; also **omit `dosesLeft` for mL/IU** doses under mixed concentration (mass pool ÷ active-vial doseMg is wrong) — §10.4. |
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

---

# Part III — Implementation Reference (file homes, signatures, tests)

Consolidated so the implementation plan is unambiguous. Where this conflicts with prose above,
this section wins.

## 14. File homes (new code)

| Symbol | Path | Kind |
|--------|------|------|
| `doseToSyringeUnits` | `lib/reconstitution/domain/doseUnits.ts` (new) | pure domain |
| `syringeMaxUnits` | `lib/reconstitution/domain/syringe.ts` (existing) | pure domain |
| `resolveActiveVial` | `lib/reconstitution/application/VialService.ts` (existing) | Prisma query helper |
| `getInventorySummaryByCompound` | `lib/reconstitution/application/VialService.ts` (existing) | Prisma aggregate |
| `setActiveVialAction` | `app/actions/reconstitution/set-active-vial.ts` (new) | Server Action |
| `Vial.isActiveForCompound` migration | `prisma/migrations/<ts>_add_vial_active_for_compound/` | additive schema |
| `CompoundInventoryView` | `app/(dashboard)/reconstitution/_components/CompoundInventoryView.tsx` (new) | client component |
| `DoseUnitsDisplay` type | `lib/reconstitution/domain/doseUnits.ts` | shared display type |

## 15. Exact signatures & contracts

- **`doseToSyringeUnits(dose, vialConcentration|null, syringeStandard)`** — total function, §3.1.
- **`syringeMaxUnits(standard: 'U100'|'U40', size: '0.3'|'0.5'|'1.0'): number`**.
- **`resolveActiveVial`** — `async resolveActiveVial(userId: string, compoundId: string, client:
  Prisma.TransactionClient | PrismaClient = prisma): Promise<Vial | null>`. Returns the raw
  Prisma `Vial` (P1: FIFO `orderBy [shelfOrder asc, expiresAt asc]`; P2: prefer
  `isActiveForCompound=true`, else FIFO). **Display surfaces serialize the result via
  `serializeVial` themselves.** Must be passed the `tx` inside `$transaction` callers.
- **`DoseUnitsDisplay`** (the single server-computed shape for ALL three surfaces) —
  `{ computable: boolean; unitsText: string | null; warning?: string }` where `unitsText` is e.g.
  `"≈ 10 units (U-100)"` or the `· reconstitute to see units` affordance text. Computed
  server-side; client never receives `Decimal`.
- **`setActiveVialAction(subjectUserId, compoundId, vialId)`** audit (via `withAudit`):
  `action: 'VIAL_SET_ACTIVE'`, `category: 'Reconstitution'`, `resourceType: 'Vial'`,
  `resourceId: vialId`, `oldValues: { previousActiveVialId: string | null }`,
  `newValues: { vialId, compoundId }`, `actorUserId`, `subjectUserId`. The in-transaction
  `updateMany` that sets `isActiveForCompound=true` must assert `count === 1` (throw + roll back
  if the vial depleted between guard and write); then unset siblings.
- **`getInventorySummaryByCompound(userId, protocols, syringeStandard)`** — §10.1; returns the
  documented per-compound shape; `dryVialRefs: Pick<SerializedVialData,'id'|'totalMg'|
  'remainingMg'|'expiresAt'>[]`.

## 16. Surface prop changes (P1)

- **`TrackerCalendar`** — new props (P1): `syringeStandard: 'U100'|'U40'`, `syringeSize:
  '0.3'|'0.5'|'1.0'`, `doseUnitsByCompoundId: Record<string, DoseUnitsDisplay>` (server-computed
  for the active/FIFO vial). P2 adds the per-compound reconstituted-vial list for the selector.
  The page (`tracker/page.tsx`, no vial query today) fetches the active vial per due-dose compound
  via `resolveActiveVial` + serializes + computes `DoseUnitsDisplay` before render.
- **Protocol detail page** (`protocols/[id]/page.tsx`) — fetch `syringeStandard`/`syringeSize` +
  `resolveActiveVial(userId, compound.id)`; compute one `DoseUnitsDisplay`; render next to the dose.
- **`BatchLogReview`** — add `doseUnits: DoseUnitsDisplay | null` to `SerializedBatchDueItem`
  (`BatchLogReview.tsx`); `getDueTodayForBatch` computes it per item server-side.
- **`logDose` individual path:** `logDoseAction` resolves the vial server-side — when
  `input.vialId` is absent and `status === 'LOGGED'`, it calls `resolveActiveVial(subjectUserId,
  compoundId, tx)` inside the transaction and uses that id. (UI need not pass a vialId.)
- **`BatchLogService`:** replace **all three** inline `tx.vial.findFirst(... FIFO ...)` copies
  (in `logOneInBatch`) with `resolveActiveVial(subjectUserId, compoundId, tx)` **inside** each
  existing `$transaction` callback (no TOCTOU window).

## 17. Test locations

- **Colocated unit tests** (no DB; 100% branch): `lib/reconstitution/domain/doseUnits.test.ts`
  (`doseToSyringeUnits` incl. the `convertDoseToMg`/`ReconstitutionCalculator` **parity test** —
  parity asserted only for **mcg/mg** where both resolve to units via the same path; for **IU**
  assert `doseToSyringeUnits = amount` separately, since `convertDoseToMg(IU)` returns *mg*, a
  different quantity, so direct parity is N/A); `syringeMaxUnits` cases in the existing
  `lib/reconstitution/domain/*` test.
- **Acceptance/integration** (`tests/acceptance/`, real Postgres): `REC-active-vial.test.ts`
  (`resolveActiveVial` incl. FIFO tiebreak — lowest `shelfOrder` wins; equal `shelfOrder` →
  earliest `expiresAt`; pointer beats FIFO in P2), `REC-set-active-vial.test.ts`
  (`setActiveVialAction`: subject/manager scoping, count-guard race, audit fields, idempotent),
  `REC-inventory-summary.test.ts` (`getInventorySummaryByCompound` branches per §11).

## 18. Added test branches (from review)

- `doseToSyringeUnits`: `totalMg ≤ 0` → `invalid_input`; IU on **both** standards.
- `getInventorySummaryByCompound`: **mL/IU dose + `hasMixedConcentration` → `dosesLeft` omitted**;
  mixed DRY+RECONSTITUTED counts; EXPIRED-status vial → EXPIRED `worstBadge` (not LOW); `>1 ACTIVE
  protocol` → omit; `totalRemaining = 0` but `reconstitutedCount > 0` → 0 doses.

## 19. Migration & index note

`add_vial_active_for_compound`: `isActiveForCompound Boolean @default(false)` — additive, no
backfill (`false` = use FIFO). **No new index needed at v1 user scale**; the existing
`@@index([userId, compoundId, status])` covers `resolveActiveVial`'s predicate.

## 20. Execution order (foundation first)

1. `doseToSyringeUnits` (+ tests) → 2. `syringeMaxUnits` (+ tests) → 3. `resolveActiveVial`
(FIFO-only, + tests) → 4. wire `resolveActiveVial` into `BatchLogService` (3 copies) and
`logDoseAction` → 5. the three display surfaces (§16). That is **Phase 1**. Phases 2 (selector +
`isActiveForCompound` + `setActiveVialAction`), 3a (inventory aggregate + view, counts/mg), 3b
(doses-left line) follow.
