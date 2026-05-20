---
description: Safety-critical math and precision rules for tracker and reconstitution
globs: ["lib/tracker/**", "lib/reconstitution/**", "app/**/tracker/**", "app/**/reconstitution/**"]
---

# Math & Precision Rules

- **Decimal Type**: ALWAYS use `Decimal` (from `decimal.js` or Prisma Decimal) for dose amounts and BAC volumes. NEVER use `Float`.
- **Unit Validation**: Explicitly validate units (mcg, mg, IU, mL) using the `DoseAmount` value object.
- **Safety Warnings**: Implement the `WarningPolicy` for high volumes (> 1.5mL) or doses above reference ranges.
- **Audit**: Every mutation in these domains must be wrapped in a transaction with an `AuditEvent` write.
