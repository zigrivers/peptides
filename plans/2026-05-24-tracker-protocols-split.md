# Implementation Plan - Tracker & Protocols Rearchitecture

This plan details the technical steps, database interactions, server actions, and UI components required to split the Tracker view into a daily **Tracker** page and a management-focused **Protocols** page, featuring smart creation guidance and real-time atomic inventory deduction.

---

## User Review Required

> [!IMPORTANT]
> **P0 Database Scoping Invariants (F-001, F-002)**
> To satisfy all AGENTS.md security invariants:
> - **Vial Mutations**: All inventory updates (decrements, increments, status changes) must be scoped strictly to the **owner's userId** (which may be a managed user's ID). We will use Prisma's `updateMany` with the predicate `{ id: vialId, userId: ownerUserId }`.
> - **Log Mutations (F-001)**: Deleting pending dose slots during deactivation must be explicitly scoped to the protocol owner's ID: `{ protocolId, userId: protocol.userId, status: 'PENDING', scheduledDate: { gte: utcMidnightToday() } }`.
> 
> **Atomic Real-Time Inventory Deduction & Underflow Guards (F-001, F-002, F-004, F-006)**
> - **Atomic Underflow Protection (F-002)**: To prevent inventory counts from falling below zero, atomic decrements will include an availability guard: `where: { id: vialId, userId, remainingMg: { gte: amountMg } }`. If the update affects `0` rows, the system throws an `insufficient_inventory` exception.
> - **Delta Optimization (F-005)**: If a dose log is edited and the vial ID remains the same, we will calculate the difference (new - old) and perform a single atomic adjustment query rather than separate increment and decrement calls.
> - **Syringe Standard Context**: IU to mg conversions require the user's `syringeStandard` (U-100 or U-40). We will retrieve this preference before executing the deduction.
> - **Selective Vial State Restoration (F-004)**: If a dose is skipped/edited and the vial's `remainingMg` goes back above `0`, the status of the vial will transition from `DEPLETED` back to `RECONSTITUTED` **only if** the current status is `DEPLETED` (preventing overwrite of terminal states like `EXPIRED`).
> - **Zero-Division Protection (F-004)**: Before performing any mL or IU conversions, the system will validate that the vial has positive values for both `totalMg` and `bacWaterMl`, throwing a validation error if the user attempts to log mL/IU doses against dry or un-reconstituted vials.
> 
> **Soft Deletion & Pending Log Cleanup (F-001, F-005)**
> - **Soft Deletion**: To preserve historical dose logging data for analytics, deleting a protocol will update its status to `DEACTIVATED` instead of dropping the row.
> - **Future Log Cleanup (F-005)**: When deactivating, the system will delete all `PENDING` dose logs associated with that protocol starting from the current day onwards (`scheduledDate >= utcMidnightToday()`) to keep the daily Tracker view clean.
> 
> **Zod Parser for Dose Guidance & Legacy Support (F-003, F-006)**
> - The existing `dosingLow`, `dosingTypical`, and `dosingHigh` JSON columns in `CompoundProfile` will be structured to include a `researchBenefits` and `recommendedFrequency` description string.
> - We will implement a Zod parser `parseCompoundDosing(json)` in the application layer. If legacy records do not have these fields, the parser will gracefully fallback to default values, avoiding runtime exceptions.

---

## Proposed Changes

### 1. Database & Core Services

#### [NEW] [lib/reconstitution/application/InventoryService.ts](file:///Users/kenallred/Developer/peptides/lib/reconstitution/application/InventoryService.ts)
- Implement `decrementVialInventory(tx, userId, vialId, amount, unit, syringeStandard)`:
  - Convert amount to mg using `convertDoseToMg` (verifying `vial.totalMg` and `vial.bacWaterMl` are both positive).
  - Execute atomic decrement with ownership and underflow guard (F-002):
    ```ts
    const result = await tx.vial.updateMany({
      where: { id: vialId, userId, remainingMg: { gte: amountMg } },
      data: { remainingMg: { decrement: amountMg } }
    });
    if (result.count === 0) throw new Error('insufficient_inventory_or_not_owned');
    ```
  - Read the updated vial. If `remainingMg <= 0`, set status to `DEPLETED` via `tx.vial.updateMany` with ownership scoping.
- Implement `incrementVialInventory(tx, userId, vialId, amount, unit, syringeStandard)`:
  - Convert amount to mg.
  - Execute atomic increment with ownership check:
    ```ts
    const result = await tx.vial.updateMany({
      where: { id: vialId, userId },
      data: { remainingMg: { increment: amountMg } }
    });
    if (result.count === 0) throw new Error('vial_not_found_or_not_owned');
    ```
  - Read the updated vial. If `remainingMg > 0`, transition status back to `RECONSTITUTED` **only if** current status is `DEPLETED` (F-004).

#### [MODIFY] [DoseLogService.ts](file:///Users/kenallred/Developer/peptides/lib/tracker/application/DoseLogService.ts)
- Update `logDose` to call `decrementVialInventory` and `incrementVialInventory` during creates, updates, and deletes of dose logs. 
- Implement atomic delta adjustment when updating a dose log on the same vial (F-005).

#### [MODIFY] [BatchLogService.ts](file:///Users/kenallred/Developer/peptides/lib/tracker/application/BatchLogService.ts)
- Update `batchLogDoses` to call `decrementVialInventory` for each logged item in the transaction, loading the user's `syringeStandard` first.

#### [MODIFY] [ProtocolService.ts](file:///Users/kenallred/Developer/peptides/lib/tracker/application/ProtocolService.ts)
- Update `listProtocolsForUser(userId)` to also accept an array of managed user IDs:
  - Return all protocols owned by the user and their managed accounts.
- Add `deactivateProtocol(actorUserId, protocolId)`:
  - Query protocol checking both `id` and ownership (self/managed).
  - Update status to `DEACTIVATED`.
  - Delete any associated `DoseLog` entries where `userId = protocol.userId`, `protocolId = protocolId`, `scheduledDate >= utcMidnightToday()`, and status is `PENDING` (F-001, F-005).
  - Log `PROTOCOL_DEACTIVATED` audit event.

### 2. Server Actions

#### [NEW] [actions/tracker/protocol-lifecycle.ts](file:///Users/kenallred/Developer/peptides/app/actions/tracker/protocol-lifecycle.ts)
- Export lifecycle actions verifying `actorUserId` credentials and calling the updated services.

### 3. Frontend Pages & Routing

#### [NEW] [app/(dashboard)/protocols/page.tsx](file:///Users/kenallred/Developer/peptides/app/(dashboard)/protocols/page.tsx)
- Fetch protocols for the actor and managed users.
- Render user filters/selectors to view managed account protocols.
- Display start date, route, frequency, expected benefits, safety warnings, citations, and pause/deactivate controls.

#### [MODIFY] [app/(dashboard)/tracker/page.tsx](file:///Users/kenallred/Developer/peptides/app/(dashboard)/tracker/page.tsx)
- Replace bottom protocol list with a compact "Regimen Overview" summary widget linking to `/protocols`.

#### [MODIFY] [app/(dashboard)/tracker/protocols/new/page.tsx](file:///Users/kenallred/Developer/peptides/app/(dashboard)/tracker/protocols/new/page.tsx)
- Guided form utilizing structured compound JSON dosing data to render dose tile cards, research benefits, frequency guidelines, and warnings dynamically.

---

## Verification Plan

### Automated Tests
- Write Vitest tests in `lib/tracker/application/DoseLogService.test.ts` and `lib/tracker/application/BatchLogService.test.ts` asserting atomic increments/decrements.
- Assert that deleting/deactivating a protocol leaves historical logs intact but removes future pending slots.
- Run `pnpm check`.
