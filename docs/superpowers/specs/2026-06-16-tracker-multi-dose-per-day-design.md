# Tracker: Multiple Doses Per Day (twice-daily) + All Frequencies — Design Spec

**Date:** 2026-06-16
**Status:** Approved (autonomous goal) — implementing
**Domains:** `lib/tracker` (schedule + dose-log, Decimal/audit safety), tracker UI, Prisma schema (additive)

## Problem / Goal

Regimens can be twice-daily (`TwiceDaily`, `TwiceSpecificDaysOfWeek`), but the Tracker can't log two
separate doses on the same day: `DoseLog` is `@@unique([userId, protocolId, scheduledDate])` (one
log/day) and `ScheduleGenerator` collapses twice-daily into one date/day. Support multiple doses per
day in the Tracker UI for **every** frequency we support (Daily, TwiceDaily, EOD, SpecificDaysOfWeek,
TwiceSpecificDaysOfWeek, CustomInterval), each dose independently loggable (own site, units, notes,
log/skip), with clear per-slot time-of-day labels.

## Frequencies & per-day counts (what "all frequencies" means)
| Frequency | Days | Doses/day |
|-----------|------|-----------|
| Daily | every day | 1 |
| EOD | every other day | 1 |
| SpecificDaysOfWeek | listed weekdays | 1 |
| CustomInterval | every N days | 1 |
| **TwiceDaily** | every day | **2** |
| **TwiceSpecificDaysOfWeek** | listed weekdays | **2** |
(The `Schedule` union caps multiplicity at 2; `PreferredTime` may say `MORNING_AND_NIGHT`. Thrice-daily
isn't expressible in the schedule, so we support 1–2 slots/day.)

## Decisions (autonomous)

| Decision | Choice |
|----------|--------|
| Per-day model | Add `doseSlot Int @default(0)` to `DoseLog`; unique → `@@unique([userId, protocolId, scheduledDate, doseSlot])` (additive migration) |
| Doses/day source | Derived from the **schedule frequency** (2 for Twice*; else 1) — authoritative for the tracker |
| Slot labels | Pure helper; 1/day → single unlabeled slot; 2/day → `Morning` / `Evening` when the compound's `preferredTime` is `MORNING_AND_NIGHT`, else `1st dose` / `2nd dose` |
| Independence | Each slot logs independently (own injection site, units/dose, notes, LOGGED/SKIPPED), decrements inventory per slot |
| Day completion | A day is "processed/adhered" only when **all** slots are logged/skipped |

## Architecture

### A. Schema (additive migration)
- `DoseLog.doseSlot Int @default(0)`; replace `@@unique([userId, protocolId, scheduledDate])` with
  `@@unique([userId, protocolId, scheduledDate, doseSlot])`. Keep `@@index([userId, scheduledDate])`.
- Migration SQL: `ALTER TABLE "DoseLog" ADD COLUMN "doseSlot" INTEGER NOT NULL DEFAULT 0;` then
  `DROP` the old unique index and `CREATE UNIQUE INDEX` on the 4-tuple. Existing rows → slot 0.
  Backup DB first; `prisma migrate deploy` (never reset).

### B. Schedule domain (`lib/tracker/domain/ScheduleGenerator.ts` or new `doseSlots.ts`)
- `dosesPerDay(schedule): 1 | 2` — 2 for `TwiceDaily`/`TwiceSpecificDaysOfWeek`, else 1.
- `getDoseSlots(schedule, preferredTime?): { slot: number; label: string }[]` — `[{slot:0,label:''}]`
  for 1/day; for 2/day `[{0,'Morning'},{1,'Evening'}]` when `preferredTime==='MORNING_AND_NIGHT'`
  else `[{0,'1st dose'},{1,'2nd dose'}]`. Pure, 100% tested.

### C. DoseLogService (`lib/tracker/application/DoseLogService.ts`)
- `LogDoseInput.doseSlot?: number` (default 0). Validate `0 ≤ doseSlot < dosesPerDay(schedule)`.
- `idempotencyKey` includes the slot (`{user}:{protocol}:{YYYY-MM-DD}:{slot}`). `findDoseLogForDate`
  and the existing-log lookups become slot-aware. The `@@unique`/P2002 recovery includes slot.
- Schedule validity: the **day** must be scheduled (`isScheduledOn`) AND `doseSlot < dosesPerDay`.
- Inventory decrement / cost / audit per slot, unchanged otherwise.

### D. Tracker UI (`TrackerCalendar.tsx`)
- Expand events: for each scheduled (protocol, date), emit `dosesPerDay` SCHEDULED events, one per slot
  (`scheduled-{protocolId}-{dateStr}-{slot}`), each carrying `doseSlot` + slot `label`.
- Map LOGGED/SKIPPED events back by `(protocolId, dateStr, doseSlot)`.
- Render each slot as its own card/row in the day panel with the slot label (e.g. "Morning" / "Evening")
  when 2/day; single (unlabeled) when 1/day. Each logs/skips independently via `logDoseAction({ doseSlot })`.
- "N of M processed" and the calendar cell completion ring count **slots** (M = Σ dosesPerDay over the
  day's protocols). Streak/adherence: a day counts only when all its slots are processed.
- The compact calendar cell badges show one chip per slot (or a "×2" affix) — keep it legible.

### E. Supporting surfaces (audited + fixed in the dogfood phase)
- **Batch log / due-today** (`BatchLogService`): a twice-daily day has 2 slots; batch must log all slots
  (or be explicit). Treat in implementation; verify in audit.
- **Reminders** (`ReminderDispatcher`): twice-daily → both slots due; verify dedupe per slot.
- **Regimen Summary**: already shows `×2/day`; ensure consistency.
- **Inventory runout** (`calculateCompoundRunout`): must count 2 doses/day for twice-daily (it sums
  daily equivalents from the schedule — verify it doubles for Twice*).

## Testing
- Domain: `dosesPerDay`/`getDoseSlots` for all 6 frequencies (+ preferredTime labels) — 100%.
- DoseLogService: log slot 0 and slot 1 same day → two rows (no unique clash); slot ≥ dosesPerDay
  rejected; idempotent re-log per slot; inventory decremented per slot; audit per slot.
- Tracker (jsdom): twice-daily day shows two labeled dose cards; logging one leaves the other pending;
  "1 of 2 processed" reflects slots; single-dose frequencies unchanged.
- Migration additive; existing logs become slot 0 (verified against the dev DB after backup).
- Full `pnpm check` green; safety-domain coverage maintained.

## Rollout / safety
- Backup dev DB before migrating; `migrate deploy`; verify row counts unchanged + existing logs slot 0.
- Per ADR rules: every dose-log mutation stays userId-scoped + audited; Decimal-only dose math.

## Dogfood audit (post-implementation, before ship)
Deep audit of **Regimen, Tracker, Inventory** views (code + live dev where feasible): twice-daily end
to end (schedule → 2 slots → log each → inventory decrement → runout → regimen summary), all other
frequencies regress cleanly, mobile + a11y, honest framing, no console errors. Fix all findings, then
ship this branch and the regimen-summary work.
