# Reconstitution Domain

The Reconstitution Domain manages vial inventory and the mathematical calculations for concentration and syringe units.

## Ubiquitous Language
- **Vial**: A container of a compound in powder or liquid form.
- **Concentration**: The resulting amount of compound per mL of liquid.
- **Syringe Units**: The measurement on a 100-unit insulin syringe (1 unit = 0.01mL).

## Entities

### Vial (Aggregate Root)
A single unit of inventory.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `compoundId`: UUID (FK)
  - `orderId`: UUID (FK, optional — populated when the vial originated from an order receipt; null when added manually)
  - `totalMg`: number (must use `Decimal` type — never `Float`)
  - `bacWaterMl`: number (optional; `Decimal`)
  - `remainingMg`: number (`Decimal`)
  - `status`: enum (Dry, Reconstituted, Empty, Expired)
  - `reconstitutedAt`: timestamp (optional)
  - `expiresAt`: timestamp (optional — defaults to 14 days post-reconstitution; configurable per-vial)

## Value Objects

### ReconstitutionResult
The output of a reconstitution calculation.
- **Attributes**:
  - `concentrationMgPerMl`: number (`Decimal`)
  - `concentrationMcgPerMl`: number (`Decimal`)
  - `syringeUnitsPerDose`: number (`Decimal` — based on a 100-unit insulin syringe, 1 unit = 0.01mL)
  - `injectionVolMl`: number (`Decimal`)
  - `lowDoseUnits`: number (`Decimal`, optional — cross-check against profile dosingLow)
  - `typicalDoseUnits`: number (`Decimal`, optional — cross-check against profile dosingTypical)
  - `highDoseUnits`: number (`Decimal`, optional — cross-check against profile dosingHigh)

## Domain Services

### ReconstitutionCalculator
Performs safe reconstitution math with warning policy evaluation.
- **Warning Policy**:
  - `injectionVolMl > 1.5` -> Trigger "High Volume" warning.
  - `bacWaterMl < 0.5` -> Trigger "Low BAC Volume" warning.
  - `dose > Profile.maxDose` -> Trigger "Above Reference Range" warning.

## Domain Events
- `VialReconstituted`: BAC water is added to a vial.
- `SafetyWarningTriggered`: A calculation results in a policy violation.

## Invariants
- `vial.remainingMg >= 0`
- `vial.totalMg > 0`
- `bacWaterMl > 0` (once reconstituted)
