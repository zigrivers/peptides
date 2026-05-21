# Ordering Domain

The Ordering Domain manages vendor product catalogs, Telegram communication, and the order lifecycle.

## Ubiquitous Language
- **Order**: A purchase transaction for one or more vendor products.
- **Order Line Item**: A single compound + form + vial-size + quantity entry within an Order.
- **Vendor**: An external grey-market vendor reachable via Telegram (v1: QSC only).
- **Vendor Catalog Product**: A vendor-specific listing of a Compound (vial size, form, price, in-stock).
- **Payment Confirmation**: The explicit step where a user verifies the destination wallet and amount.
- **Send Method**: Whether the order's Telegram message was dispatched via MTProto automation or via the manual fallback path.

## Entities

### Vendor (Aggregate Root)
An external grey-market vendor accessible via Telegram.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK — the Power User who configured this vendor; v1 ordering is single-user)
  - `displayName`: string
  - `telegramHandle`: string (username or chat ID)
  - `messageTemplate`: text (composes the order message; supports `{lineItems}` placeholder)
  - `preferredCurrency`: enum (USDT, BTC, ETH, USD, Other)
  - `status`: enum (Active, Disabled)
  - `createdAt`: timestamp

### VendorCatalogProduct (Entity)
A vendor-specific catalog entry mapping a Compound to a vial size + price.
- **Attributes**:
  - `id`: UUID
  - `vendorId`: UUID (FK — Vendor aggregate)
  - `compoundId`: UUID (FK — Reference domain Compound)
  - `form`: enum (LyophilizedPowder, Solution)
  - `vialSizeMg`: number
  - `unitPrice`: number
  - `currency`: string
  - `minimumOrderQuantity`: number (default 1)
  - `inStock`: boolean (manual toggle in v1; no live sync)
  - `updatedAt`: timestamp

### Order (Aggregate Root)
A purchase transaction.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `vendorId`: UUID (FK)
  - `lineItems`: OrderLineItem[] (Value Object collection — see below)
  - `status`: enum (Draft, Sent, Confirmed, PaymentSent, Received, Cancelled, Stale)
  - `sendMethod`: enum (Automated, ManualFallback) — recorded when status first transitions to Sent
  - `paymentConfirmation`: PaymentConfirmation (Value Object, optional)
  - `telegramMessageId`: string (optional — set when sendMethod is Automated)
  - `telegramMessageText`: text (the exact message sent — archived for audit + idempotency)
  - `idempotencyKey`: string (UUID — unique per send attempt; duplicate sends to the same vendor within 60s share the key)
  - `createdAt`: timestamp
  - `sentAt`: timestamp (optional)
  - `staleFlaggedAt`: timestamp (optional — set by background job after 14 days in Sent without update)
  - `cancelledAt`: timestamp (optional)
  - `cancelledByUserId`: UUID (FK, optional)
  - `receivedAt`: timestamp (optional)

## Value Objects

### OrderLineItem
A single line on an Order.
- **Attributes**:
  - `compoundId`: UUID (FK — Reference domain)
  - `vendorCatalogProductId`: UUID (FK — VendorCatalogProduct, optional; allows orders to be archived even if the catalog entry is later deleted)
  - `form`: enum (LyophilizedPowder, Solution)
  - `vialSizeMg`: number
  - `quantity`: number (≥ 1)
  - `unitPrice`: number (optional — recorded at send time, not later)
  - `unitCurrency`: string (optional)
- **Invariants**:
  - Duplicate (compoundId + form + vialSizeMg) line items in the same Order are merged into a single line with summed quantity at construction time.

### PaymentConfirmation
The safety gate for crypto payments.
- **Attributes**:
  - `confirmedTotal`: number
  - `currency`: string (e.g., "USDT")
  - `walletAddress`: string
  - `acknowledgedAt`: timestamp
  - `acknowledgedByUserId`: UUID

## Aggregate: Order Transaction
- **Consistency Boundary**: Order status, line items, send-method, payment acknowledgement.
- **Root**: Order
- **Invariants**:
  - `status` cannot transition to `PaymentSent` without a completed `paymentConfirmation`.
  - `paymentConfirmation.walletAddress` must be non-empty.
  - `status` transitions are forward-only except `Cancelled`, which can be reached from any non-terminal state.
  - `sendMethod` is set exactly once, at the transition into `Sent`, and is immutable afterward.

## Aggregate: Vendor Configuration
- **Consistency Boundary**: A Vendor and its VendorCatalogProducts.
- **Root**: Vendor
- **Invariants**:
  - Soft-deleting a Vendor (status = Disabled) does not delete VendorCatalogProducts; historical Orders retain their `vendorId` reference.

## Domain Events
- `VendorConfigured`: Power User completes Telegram auth + vendor setup.
- `VendorCatalogProductUpserted`: A vendor catalog product is added or updated.
- `OrderDrafted`: An order is created in Draft status.
- `OrderSent`: Telegram message dispatched (automated or manual fallback).
- `OrderConfirmed`: Vendor reply captured; price + wallet address recorded.
- `PaymentAcknowledged`: User completes the safety gate verification.
- `OrderPaymentSent`: User marks payment as sent.
- `OrderReceived`: User confirms delivery and triggers inventory update.
- `OrderCancelled`: User cancels a non-terminal order.
- `OrderMarkedStale`: Background job flags a 14-day-old Sent order.
- `DuplicateSendBlocked`: A duplicate send to the same vendor within 60s was intercepted and required confirmation.

## Invariants
- `order.idempotencyKey` is unique per `(userId, vendorId, telegramMessageText, 60-second-window)`.
- `order.lineItems.length >= 1` for any Order with `status != Draft`.
