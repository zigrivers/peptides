# Database Schema Design

**Status:** Draft
**Date:** 2026-05-20
**Tech Stack source:** `docs/tech-stack.md`
**Domain Model source:** `docs/domain-models/`
**Source of truth:** `prisma/schema.prisma` (this document mirrors that file; if they diverge, `schema.prisma` wins)
**Methodology:** deep | Depth: 5/5

---

## 1. Schema Definition (Prisma DSL — abridged)

We use Prisma as our ORM. The PostgreSQL 16 schema is defined in `prisma/schema.prisma`. The DSL excerpts below show the model surface; for any detail not shown here (e.g., `@db` annotations, exact index lists), consult `prisma/schema.prisma`.

```prisma
// prisma/schema.prisma — excerpts (full file is the source of truth)

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --- Auth Domain (Auth.js v5 standard + Custom) ---

enum UserRole {
  POWER_USER
  MANAGED_USER
}

model User {
  id              String   @id @default(uuid())
  name            String?
  email           String   @unique
  emailVerified   DateTime?
  image           String?
  passwordHash    String?
  role            UserRole @default(POWER_USER)
  status          String   @default("ACTIVE")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  managedBy       String?
  owner           User?    @relation("ManagedUsers", fields: [managedBy], references: [id])
  managedUsers    User[]   @relation("ManagedUsers")

  onboardingState Json?
  syringeStandard String @default("U100")
  syringeSize     String @default("1.0")

  // Auth.js adapter relations
  accounts            Account[]
  sessions            Session[]

  // Custom auth lifecycle
  passwordResets      PasswordResetToken[]
  emailChangeRequests EmailChangeRequest[]
  deletionRequest     AccountDeletionRequest?
  exportRequests      DataExportRequest[]

  // App relations
  protocols           Protocol[]
  cycles              Cycle[]
  doseLogs            DoseLog[]
  outcomeLogs         OutcomeLog[]
  vials               Vial[]
  orders              Order[]
  invitesSent         Invite[]   @relation("InvitesSent")
  vendors             Vendor[]
  telegramSession     TelegramSession?
  reminderPrefs       ReminderPreference?
  pushSubscriptions   PushSubscription[]

  @@index([managedBy])
}

// Standard Auth.js v5 adapter models
model Account { /* provider/providerAccountId pair; FK userId; standard Auth.js fields */ }

model Session {
  id           String    @id @default(uuid())
  sessionToken String    @unique
  userId       String
  expires      DateTime
  // Extension fields beyond Auth.js standard (per ADR-004):
  lastSeenAt   DateTime  @default(now())
  ipAddress    String?
  userAgent    String?
  revokedAt    DateTime?  // set on password change to invalidate other sessions
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, revokedAt])
}

model VerificationToken { /* Auth.js standard */ }

// Custom auth lifecycle tables
model Invite                 { id, email, token (unique), powerUserId, status, expiresAt (createdAt+72h), createdAt }
model PasswordResetToken     { id, userId, tokenHash (unique), expiresAt (createdAt+1h), used }
model AccountDeletionRequest { id, userId (unique), requestedAt, scheduledFor (+48h), status }
model DataExportRequest      { id, userId, format, status, downloadUrl, expiresAt (+7d), createdAt }
model EmailChangeRequest     { id, userId, newEmail, tokenHash (unique), createdAt, expiresAt (+24h), verifiedAt, appliedAt, revertibleUntil (+48h post-apply), status }

// --- Reference Domain ---

model Compound {
  id                  String  @id @default(uuid())
  name                String  @unique
  iupacName           String?
  synonyms            String[]
  mechanismOfAction   String?
  administrationRoutes String[]   // PostgreSQL text[] (e.g. ["SC", "IM"])
  status              String  @default("PUBLISHED")  // PUBLISHED | DRAFT | ARCHIVED
  archivedAt          DateTime?

  profile             CompoundProfile?
  products            VendorProduct[]
  protocols           Protocol[]
  vials               Vial[]
  orderItems          OrderItem[]

  @@index([status])
}

model CompoundProfile {
  id            String   @id @default(uuid())
  compoundId    String   @unique
  compound      Compound @relation(...)
  dosingLow     Json     // DoseAmount value object
  dosingTypical Json     // DoseAmount value object
  dosingHigh    Json     // DoseAmount value object
  sideEffects   String?
  stackingNotes String?
  citations     Citation[]
}

model Citation { id, profileId, title, url?, doi?, pmid? }

// --- Tracker Domain ---

model Protocol {
  id                  String   @id @default(uuid())
  userId              String
  compoundId          String
  cycleId             String?
  dose                Json     // DoseAmount object
  schedule            Json     // Schedule object (frequency: Daily | EOD | SpecificDaysOfWeek | CustomInterval; daysOfWeek; intervalDays)
  administrationRoute String
  status              String   @default("ACTIVE")  // ACTIVE | PAUSED | COMPLETED | DEACTIVATED
  startDate           DateTime
  endDate             DateTime?
  notes               String?

  doseLogs            DoseLog[]

  @@index([userId, status])
}

model Cycle {
  id        String   @id @default(uuid())
  userId    String
  name      String
  startDate DateTime
  endDate   DateTime?
  status    String   @default("ACTIVE")  // ACTIVE | PAUSED | COMPLETED (aligned with PRD §5.2.4)

  protocols Protocol[]

  @@index([userId])
}

model DoseLog {
  id              String   @id @default(uuid())
  protocolId      String
  userId          String
  vialId          String?
  idempotencyKey  String   @unique         // primary client-supplied key
  loggedAt        DateTime @default(now())
  scheduledDate   DateTime
  amount          Json     // DoseAmount
  status          String   @default("LOGGED")  // LOGGED | SKIPPED
  injectionSite   Json?    // InjectionSite VO
  isBatchLog      Boolean  @default(false)
  note            String?
  loggedByUserId  String?

  @@index([userId, scheduledDate])
  @@unique([userId, protocolId, scheduledDate])  // defense-in-depth against idempotencyKey drift
}

model OutcomeLog {
  id              String   @id @default(uuid())
  userId          String
  scheduledDate   DateTime @db.Date
  loggedAt        DateTime @default(now())
  overallRating   Int                       // 1-5 (CHECK enforced at application layer)
  tags            String[]
  note            String?  @db.Text
  createdAt       DateTime @default(now())

  protocolRatings ProtocolRating[]

  @@unique([userId, scheduledDate])         // one OutcomeLog per user per day
  @@index([userId, scheduledDate])
}

model ProtocolRating {
  id           String     @id @default(uuid())
  outcomeLogId String
  protocolId   String
  rating       Int                          // 1-5
  @@index([protocolId])
}

model ReminderPreference {
  id                   String   @id @default(uuid())
  userId               String   @unique
  reminderTime         String   // user-local "HH:MM"
  timezone             String   // IANA zone
  channel              String   // PUSH | EMAIL | BOTH
  enabled              Boolean  @default(true)
  pushPermissionState  String   @default("NOT_PROMPTED")  // GRANTED | DENIED | NOT_PROMPTED
  emailFallbackEnabled Boolean  @default(true)
  updatedAt            DateTime @updatedAt
}

model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
}

// --- Reconstitution Domain ---

model Vial {
  id              String   @id @default(uuid())
  userId          String
  compoundId      String
  orderItemId     String?              // provenance: which order line item produced this vial; null = manual entry
  totalMg         Decimal  @db.Decimal(10, 3)
  bacWaterMl      Decimal? @db.Decimal(10, 3)
  remainingMg     Decimal  @db.Decimal(10, 3)
  status          String   @default("DRY")  // DRY | RECONSTITUTED | EMPTY | EXPIRED
  reconstitutedAt DateTime?
  expiresAt       DateTime?                  // default = reconstitutedAt + 14d

  doseLogs        DoseLog[]

  @@index([userId, compoundId, status])
}

// --- Ordering Domain ---

model Vendor {
  id                String   @id @default(uuid())
  userId            String                            // single-user-per-vendor in v1
  name              String
  telegramUsername  String
  messageTemplate   String?  @db.Text
  preferredCurrency String   @default("USDT")          // USDT | BTC | ETH | USD | OTHER
  status            String   @default("ACTIVE")        // ACTIVE | DISABLED
  createdAt         DateTime @default(now())

  products          VendorProduct[]
  orders            Order[]

  @@unique([userId, telegramUsername])
  @@index([userId, status])
}

model VendorProduct {
  id          String   @id @default(uuid())
  vendorId    String
  compoundId  String
  name        String
  priceUsd    Decimal  @db.Decimal(10, 2)
  inStock     Boolean  @default(true)
  orderItems  OrderItem[]
  @@index([vendorId, inStock])
}

model Order {
  id                  String   @id @default(uuid())
  userId              String
  vendorId            String
  status              String   @default("DRAFT")  // DRAFT | SENT | CONFIRMED | PAYMENT_SENT | RECEIVED | CANCELLED | STALE
  sendMethod          String?                    // AUTOMATED | MANUAL_FALLBACK (set at transition into SENT, immutable)
  paymentConfirmation Json?
  telegramMessageId   String?
  messageText         String?  @db.Text
  idempotencyKey      String   @unique
  sentAt              DateTime?
  staleFlaggedAt      DateTime?                  // set by daily cron after 14d in SENT
  cancelledAt         DateTime?
  cancelledByUserId   String?
  receivedAt          DateTime?
  createdAt           DateTime @default(now())

  items               OrderItem[]

  @@index([userId, status])
  @@index([status, sentAt])
}

model OrderItem {
  id            String   @id @default(uuid())
  orderId       String
  productId     String?                              // nullable: catalog product may be archived later
  compoundId    String                               // direct FK to Compound (preserves line on product archive)
  form          String                               // LYOPHILIZED_POWDER | SOLUTION
  vialSizeMg    Decimal  @db.Decimal(10, 3)
  quantity      Int
  unitPrice     Decimal? @db.Decimal(10, 2)
  unitCurrency  String?

  vials         Vial[]

  @@unique([orderId, compoundId, form, vialSizeMg])  // duplicate-merge invariant from PRD §5.4.3
}

model TelegramSession {
  id            String   @id @default(uuid())
  userId        String   @unique
  sessionString String                              // AES-256-GCM encrypted server-side
  isActive      Boolean  @default(true)
  updatedAt     DateTime @updatedAt
}

// --- Audit Domain ---

model AuditEvent {
  id            String   @id @default(uuid())
  timestamp     DateTime @default(now())
  actorUserId   String                              // historical reference — NO FK constraint (per ADR-009)
  subjectUserId String?                             // historical reference — NO FK constraint
  category      String                              // Security | Protocol | Order | Admin | Auth | Reconstitution
  action        String                              // canonical action names (see docs/domain-models/audit.md)
  resourceId    String
  resourceType  String
  metadata      Json?
  oldValues     Json?
  newValues     Json?

  @@index([timestamp])
  @@index([actorUserId])
  @@index([subjectUserId])
  @@index([category, timestamp])
}
```

---

## 2. Normalization, Precision, and Integrity

### 2.1 Normalization
- **3NF compliance**: all relational tables are in 3NF.
- **JSON columns** are intentionally used for: `DoseAmount`, `Schedule`, `InjectionSite`, `PaymentConfirmation`, `onboardingState`. These are value-object payloads with infrequent v1 query needs (filters/joins go through the relational columns; JSON is for retrieval).
- **PostgreSQL text arrays** (`String[]`) are used for `Compound.administrationRoutes`, `Compound.synonyms`, and `OutcomeLog.tags` — small, low-cardinality multi-selects without join tables.

### 2.2 Precision (`Decimal` only for safety-critical numeric fields)
Per `.claude/rules/safety-math.md` and ADR-008, all dose-amount, volume, and concentration fields use `Decimal`:
- `Vial.totalMg / bacWaterMl / remainingMg` → `@db.Decimal(10, 3)` (max 9 999 999.999 mg per vial)
- `OrderItem.vialSizeMg` → `@db.Decimal(10, 3)`
- `OrderItem.unitPrice` / `VendorProduct.priceUsd` → `@db.Decimal(10, 2)`
- `DoseAmount.value` (inside JSON) → serialized as string; the application layer reads it through `decimal.js` and asserts `isFinite()` + non-negative on the way in.

`Float` is forbidden anywhere in the safety-math path.

### 2.3 Referential integrity exceptions
- **`AuditEvent.actorUserId` and `subjectUserId`** are intentionally NOT FKs to `User.id` (per ADR-009). Audit records must survive user deletion. The query layer joins via `LEFT JOIN` and renders "[deleted user]" when the join misses.
- **`OrderItem.productId`** is nullable: if a `VendorProduct` row is later archived/deleted, the line item still resolves via `OrderItem.compoundId` (which has a direct FK to `Compound`).
- **`Vial.orderItemId`** is nullable for the manual-entry case (vials added by the Power User without a prior order).
- **`DoseLog.vialId`** is nullable for "logged without active vial" (with warning, per PRD §5.2.2 error scenarios).

### 2.4 Idempotency / deduplication invariants
- `DoseLog`: BOTH `idempotencyKey @unique` (client-supplied) AND `@@unique([userId, protocolId, scheduledDate])` (server-derived). The latter is defense-in-depth against client key drift.
- `OutcomeLog`: `@@unique([userId, scheduledDate])` — one log per user per day.
- `OrderItem`: `@@unique([orderId, compoundId, form, vialSizeMg])` — implements the PRD §5.4.3 duplicate-merge invariant.
- `Order.idempotencyKey @unique` — used by the 60-second duplicate-send check (`(userId, vendorId, messageText, 60s window)` is the application-layer derivation; the unique key just enforces persistence-level dedupe).
- `Vendor`: `@@unique([userId, telegramUsername])` — a user can't configure the same vendor twice.

---

## 3. Indexing Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| `User` | `@@index([managedBy])` | "Managed users for power user X" admin query |
| `User` | `email` (unique) | Auth lookup |
| `Session` | `@@index([userId, revokedAt])` | Active session enumeration for password-change session invalidation |
| `Invite` | `token` (unique) | Invite link resolution |
| `EmailChangeRequest` | `@@index([userId, status])` | Pending-request lookup on settings page |
| `Compound` | `@@index([status])` | Catalog browse filtered to PUBLISHED |
| `DoseLog` | `@@index([userId, scheduledDate])` | Dashboard "today's doses" + history paging |
| `DoseLog` | `@@unique([userId, protocolId, scheduledDate])` | PWA sync conflict prevention (server-side) |
| `OutcomeLog` | `@@index([userId, scheduledDate])` + `@@unique` | Daily outcome lookup + uniqueness invariant |
| `Protocol` | `@@index([userId, status])` | Active protocol list |
| `Cycle` | `@@index([userId])` | Cycle list per user |
| `Vial` | `@@index([userId, compoundId, status])` | Active vial lookup for dose logging + reconstitution |
| `Vendor` | `@@unique([userId, telegramUsername])` + `@@index([userId, status])` | Vendor list per user |
| `VendorProduct` | `@@index([vendorId, inStock])` | Order builder catalog browse |
| `Order` | `@@index([userId, status])` | Order history filter |
| `Order` | `@@index([status, sentAt])` | Stale-order detection cron query |
| `OrderItem` | `@@unique([orderId, compoundId, form, vialSizeMg])` | Duplicate-merge invariant |
| `AuditEvent` | `@@index([timestamp])` | Time-range queries + retention purge |
| `AuditEvent` | `@@index([actorUserId])` | "What did user X do" admin queries |
| `AuditEvent` | `@@index([subjectUserId])` | "What was done to user X" admin queries |
| `AuditEvent` | `@@index([category, timestamp])` | Category-scoped audit pages |

---

## 4. Migration Strategy

We use **Prisma Migrate** for all schema changes.

1. **Development**: `pnpm prisma migrate dev`
   - Creates SQL migration file in `prisma/migrations/`.
   - Updates generated client.
2. **Production**: `pnpm prisma migrate deploy`
   - Runs automatically on Railway start command.
   - Fails safe if migrations are missing.
3. **Rollback**: Manual SQL rollback if needed; Prisma's forward-only approach is preferred. Breaking changes require a forward migration that handles data migration in stages (e.g., add nullable column → backfill → make required → drop old column).

### 4.1 Migration safety checklist (binding)
- Every migration that changes a safety-critical column (dose, volume, concentration, audit) must be reviewed against `.claude/rules/safety-math.md`.
- No migration may downgrade `Decimal` to `Float` or change `(precision, scale)` without an explicit ADR.
- Migrations that drop or rename a column on `AuditEvent` are prohibited without a documented retention exemption (see ADR-009).

---

## 5. Seed Data Strategy

`prisma/seed.ts` provides:
- Standard `Compound` definitions from the QSC catalog (~20–30 peptides).
- One default `Vendor` (QSC), owned by the seed Power User if applicable.
- `VendorProduct` entries linking QSC products to the seeded compounds.
- Seed data is for development only; production seed is the Power User's manual catalog entry on first run.

---

## 6. Multi-Environment Considerations

- **Railway Managed Postgres**: handles backups, encryption at rest, and point-in-time recovery (PRD §8.4).
- **Local Dev**: Docker-compose Postgres instance to match production version (PG 16). Connection string differs only by `DATABASE_URL`.
- **Test environment**: a separate `TEST_DATABASE_URL` is used by Vitest integration tests; the test database is reset between runs via `pnpm prisma migrate reset --force --skip-seed`.

---

## 7. Cross-References

- **Domain models**: `docs/domain-models/` — each Prisma model maps to a documented domain entity. See especially `auth.md`, `tracker.md`, and `ordering.md` for the field-level rationale.
- **ADRs**: ADR-002 (Postgres + Prisma), ADR-004 (Auth.js v5), ADR-008 (Testing — Decimal rule + 100% coverage on `lib/reconstitution` and `lib/audit`), ADR-009 (Audit retention + actor reference preservation), ADR-010 (AI provider — no schema impact in v1), ADR-012 (Cron — `audit_events` purge + `data_export_requests` cleanup).
- **PRD**: §5.6 (account lifecycle), §5.7 (data retention matrix), §8.2 (security NFRs).
