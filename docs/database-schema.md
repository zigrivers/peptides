# Database Schema Design

**Status:** Draft  
**Date:** 2026-05-20  
**Tech Stack source:** `docs/tech-stack.md`  
**Domain Model source:** `docs/domain-models/`  
**Methodology:** deep | Depth: 5/5

---

## 1. Schema Definition (Prisma DSL)

We use Prisma as our ORM. The following models define the PostgreSQL 16 schema.

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --- Auth Domain ---

enum UserRole {
  POWER_USER
  MANAGED_USER
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  role          UserRole  @default(POWER_USER)
  managedBy     String?   // FK to Power User
  status        String    @default("ACTIVE")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relationships
  protocols     Protocol[]
  cycles        Cycle[]
  doseLogs      DoseLog[]
  outcomeLogs   OutcomeLog[]
  vials         Vial[]
  orders        Order[]
  invitesSent   Invite[]   @relation("InvitesSent")
  telegramSession TelegramSession?
}

model Invite {
  id            String    @id @default(uuid())
  email         String
  token         String    @unique
  powerUserId   String
  powerUser     User      @relation("InvitesSent", fields: [powerUserId], references: [id])
  status        String    @default("PENDING")
  expiresAt     DateTime
  createdAt     DateTime  @default(now())
}

// --- Reference Domain ---

model Compound {
  id                  String    @id @default(uuid())
  name                String    @unique
  iupacName           String?
  mechanismOfAction   String?
  administrationRoutes String[] // PostgreSQL text array
  status              String    @default("PUBLISHED")
  
  profile             CompoundProfile?
  products            VendorProduct[]
  protocols           Protocol[]
  vials               Vial[]
}

model CompoundProfile {
  id              String    @id @default(uuid())
  compoundId      String    @unique
  compound        Compound  @relation(fields: [compoundId], references: [id])
  dosingLow       Json      // DoseAmount object
  dosingTypical   Json      // DoseAmount object
  dosingHigh      Json      // DoseAmount object
  sideEffects     String?
  stackingNotes   String?
  citations       Citation[]
}

model Citation {
  id                String    @id @default(uuid())
  profileId         String
  profile           CompoundProfile @relation(fields: [profileId], references: [id])
  title             String
  url               String
  doi               String?
  pmid              String?
}

// --- Tracker Domain ---

model Protocol {
  id                  String    @id @default(uuid())
  userId              String
  user                User      @relation(fields: [userId], references: [id])
  compoundId          String
  compound            Compound  @relation(fields: [compoundId], references: [id])
  cycleId             String?
  cycle               Cycle?    @relation(fields: [cycleId], references: [id])
  dose                Json      // DoseAmount object
  schedule            Json      // Schedule object
  administrationRoute String
  status              String    @default("ACTIVE")
  startDate           DateTime
  endDate             DateTime?
  
  doseLogs            DoseLog[]
}

model Cycle {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  name        String
  startDate   DateTime
  endDate     DateTime?
  status      String    @default("ACTIVE")
  
  protocols   Protocol[]
}

model DoseLog {
  id              String    @id @default(uuid())
  protocolId      String
  protocol        Protocol  @relation(fields: [protocolId], references: [id])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  vialId          String?
  vial            Vial?     @relation(fields: [vialId], references: [id])
  idempotencyKey  String    @unique // user:protocol:date
  loggedAt        DateTime  @default(now())
  scheduledDate   DateTime
  amount          Json      // DoseAmount object
  status          String    @default("LOGGED")
  injectionSite   Json?     // InjectionSite object
}

// --- Reconstitution Domain ---

model Vial {
  id                    String    @id @default(uuid())
  userId                String
  user                  User      @relation(fields: [userId], references: [id])
  compoundId            String
  compound              Compound  @relation(fields: [compoundId], references: [id])
  totalMg               Float
  bacWaterMl            Float?
  remainingMg           Float
  status                String    @default("DRY")
  reconstitutedAt       DateTime?
  expiresAt             DateTime?
  
  doseLogs              DoseLog[]
}

// --- Ordering Domain ---

model Vendor {
  id                String    @id @default(uuid())
  name              String
  telegramUsername  String
  status            String    @default("ACTIVE")
  
  products          VendorProduct[]
  orders            Order[]
}

model VendorProduct {
  id          String    @id @default(uuid())
  vendorId    String
  vendor      Vendor    @relation(fields: [vendorId], references: [id])
  compoundId  String
  compound    Compound  @relation(fields: [compoundId], references: [id])
  name        String
  priceUsd    Float
  inStock     Boolean   @default(true)
  
  orderItems  OrderItem[]
}

model Order {
  id                  String    @id @default(uuid())
  userId              String
  user                User      @relation(fields: [userId], references: [id])
  vendorId            String
  vendor              Vendor    @relation(fields: [vendorId], references: [id])
  status              String    @default("DRAFT")
  paymentConfirmation Json?     // PaymentConfirmation object
  telegramMessageId   String?
  idempotencyKey      String    @unique
  createdAt           DateTime  @default(now())
  
  items               OrderItem[]
}

model OrderItem {
  id          String    @id @default(uuid())
  orderId     String
  order       Order     @relation(fields: [orderId], references: [id])
  productId   String
  product     VendorProduct @relation(fields: [productId], references: [id])
  quantity    Int
}

model TelegramSession {
  id            String    @id @default(uuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id])
  sessionString String    // Encrypted AES-256
  isActive      Boolean   @default(true)
  updatedAt     DateTime  @updatedAt
}

// --- Audit Domain ---

model AuditEvent {
  id            String    @id @default(uuid())
  timestamp     DateTime  @default(now())
  actorUserId   String
  category      String
  action        String
  resourceId    String
  resourceType  String
  metadata      Json
  
  @@index([timestamp])
  @@index([actorUserId])
}
```

---

## 2. Normalization Analysis

- **3NF Compliance**: All tables are in 3NF.
- **JSON Usage**: `DoseAmount`, `Schedule`, and `PaymentConfirmation` are stored as JSON to allow flexibility in v1 without high schema churn. Core relational integrity (FKs) is maintained for all entity linkages.
- **PostgreSQL Arrays**: Used for `administrationRoutes` on `Compound` for simple multi-select storage without a junction table.

---

## 3. Indexing Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| `User` | `email` (Unique) | Auth lookup. |
| `Invite` | `token` (Unique) | Link resolution. |
| `DoseLog` | `userId`, `scheduledDate` | Dashboard schedule rendering. |
| `DoseLog` | `idempotencyKey` (Unique) | PWA sync conflict prevention. |
| `Protocol` | `userId`, `status` | Active protocol list. |
| `Order` | `userId`, `status` | Order history filters. |
| `AuditEvent` | `timestamp`, `actorUserId` | Admin auditing and log purge. |

---

## 4. Migration Strategy

We use **Prisma Migrate** for all schema changes.

1. **Development**: `pnpm prisma migrate dev`
   - Creates SQL migration file.
   - Updates generated client.
2. **Production**: `pnpm prisma migrate deploy`
   - Runs automatically on Railway start command.
   - Fails safe if migrations are missing.
3. **Rollback**: Manual SQL rollback if needed; however, Prisma's forward-only approach is preferred. Breaking changes require a forward migration that handles data migration.

---

## 5. Seed Data Strategy

`prisma/seed.ts` will provide:
- Standard `Compound` definitions from the QSC catalog.
- One default `Vendor` (QSC).
- System-wide `VendorProduct` entries for the initial catalog.

---

## 6. Multi-Environment Considerations

- **Railway Managed Postgres**: Handles backups, encryption at rest, and point-in-time recovery.
- **Local Dev**: Docker-compose Postgres instance to match production version (PG 16).
