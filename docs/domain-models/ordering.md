# Ordering Domain

The Ordering Domain manages vendor product catalogs, Telegram communication, and the order lifecycle.

## Ubiquitous Language
- **Order**: A purchase transaction for one or more vendor products.
- **Payment Confirmation**: The explicit step where a user verifies the destination wallet and amount.

## Entities

### Order (Aggregate Root)
A purchase transaction.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `vendorId`: UUID (FK)
  - `status`: enum (Draft, Sent, Confirmed, PaymentSent, Received, Cancelled, Stale)
  - `paymentConfirmation`: PaymentConfirmation (Value Object, optional)
  - `telegramMessageId`: string (optional)
  - `idempotencyKey`: string (UUID)

## Value Objects

### PaymentConfirmation
The safety gate for crypto payments.
- **Attributes**:
  - `confirmedTotal`: number
  - `currency`: string (e.g., "USDT")
  - `walletAddress`: string
  - `acknowledgedAt`: timestamp
  - `acknowledgedByUserId`: UUID

## Aggregate: Order Transaction
- **Consistency Boundary**: Order status and payment acknowledgement.
- **Root**: Order
- **Invariants**:
  - `status` cannot transition to `PaymentSent` without a completed `paymentConfirmation`.
  - `paymentConfirmation.walletAddress` must be non-empty.

## Domain Events
- `OrderSent`: Telegram message dispatched.
- `PaymentAcknowledged`: User completes the safety gate verification.
- `OrderReceived`: User confirms delivery and updates inventory.

## Invariants
- `order.idempotencyKey` is unique per order attempt.
