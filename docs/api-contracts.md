# API Contracts

**Status:** Draft  
**Date:** 2026-05-20  
**System Architecture source:** `docs/system-architecture.md`  
**Domain Model source:** `docs/domain-models/`  
**Methodology:** deep | Depth: 5/5

---

## 1. Global Standards

### 1.1 Style & Idempotency
- **Style**: RESTful Route Handlers (`app/api/*`) and Type-safe Server Actions (`app/actions/*`).
- **Idempotency**: All mutating actions MUST accept an `Idempotency-Key` (Header for API, Field for Actions).
  - **Format**: UUID v4.
  - **Behavior**: Replaying an existing key returns the *original success response*.
- **Pagination**: `page` (1-indexed) and `limit` (default: 20, max: 100). Response include `total`, `pages`, `hasNext`.

### 1.2 Common Response Shapes
**Success Response:**
```json
{
  "data": { ... },
  "warnings": Array<{ "code": string, "message": string }>
}
```

**Error Response:**
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": { "fields": Record<string, string[]> }
  }
}
```

---

## 2. Auth & Admin Module (AUT)

### 2.1 Session Lifecycle
- **[POST] /actions/auth/login**: `{ email, password }` -> `{ user }`
- **[POST] /actions/auth/logout**: `void`
- **[GET] /api/auth/session**: -> `{ session: { user } }`

### 2.2 Account Lifecycle
- **[POST] /actions/auth/reset-password-request**: `{ email }`
- **[POST] /actions/auth/reset-password-confirm**: `{ token, newPassword }`
- **[POST] /actions/auth/request-export**: `{ format: 'JSON' | 'CSV' }` -> `{ requestId }`
- **[POST] /actions/auth/schedule-deletion**: `{ passwordConfirmation }` -> `{ scheduledFor }`

### 2.3 Managed Users (Admin)
- **[GET] /api/admin/managed-users**: -> `{ items: ManagedUserDto[] }`
- **[POST] /actions/auth/invite**: `{ email }` -> `{ inviteId, expiresAt }`

---

## 3. Tracker Module (TRK)

### 3.1 Protocols
- **[GET] /api/tracker/protocols**: `?status=ACTIVE` -> `{ items: ProtocolDto[] }`
- **[POST] /actions/tracker/create-protocol**: `{ compoundId, dose, schedule, startDate, cycleId? }`
- **[PATCH] /actions/tracker/update-protocol**: `{ id, status, dose, schedule }`

### 3.2 Dose Logging
- **[POST] /actions/tracker/log-dose**: 
  - **Request**: `{ protocolId, scheduledDate, amount, status: 'LOGGED'|'SKIPPED', injectionSite?, note?, vialId? }`
  - **Response**: `200 OK` with `warnings: ['insufficient_inventory']` if applicable.
- **[POST] /actions/tracker/batch-log**: `{ logs: Array<DoseLogInput> }`

### 3.3 PWA Sync
- **[POST] /api/sync**:
  - **Request**: `{ events: Array<SyncEvent> }`
  - **Event Envelope**: `{ eventId, type: 'LOG_DOSE'|'EDIT_LOG'|'SKIP_DOSE', payload, occurredAt, timezone }`

---

## 4. Reconstitution Module (REC)

### 4.1 Calculator
- **[POST] /api/reconstitution/calculate**: `{ totalMg, bacWaterMl, targetDoseMcg }`
- **Response**: `{ concentrationMcgPerMl, unitsPerDose, injectionVolMl, warnings: SafetyWarning[] }`

### 4.2 Vial Inventory
- **[GET] /api/reconstitution/vials**: `?status=ACTIVE` -> `{ items: VialDto[] }`
- **[POST] /actions/reconstitution/save-vial**: `{ compoundId, totalMg, bacWaterMl?, expiresAt? }`

---

## 5. Ordering Module (ORD)

### 5.1 Vendor Catalog
- **[GET] /api/ordering/vendors**: -> `{ items: VendorDto[] }`
- **[GET] /api/ordering/products**: `?vendorId=uuid` -> `{ items: ProductDto[] }`

### 5.2 Order Lifecycle
- **[POST] /actions/ordering/create-draft**: `{ vendorId, items: Array<{ productId, quantity }> }`
- **[POST] /actions/ordering/send-order**: `{ orderId }` -> `{ telegramMessageId, fallbackText? }`
- **[POST] /actions/ordering/confirm-quote**: `{ orderId, confirmedTotal, currency, walletAddress }` -> **Sent -> Confirmed**
- **[POST] /actions/ordering/mark-paid**: `{ orderId, txId?, acknowledged: boolean }` -> **Confirmed -> PaymentSent**
- **[POST] /actions/ordering/mark-received**: `{ orderId, itemsToInventory: Array<{ productId, vialDetails }> }`

---

## 6. Expanded Domain Error Catalog

| Code | Status | Meaning |
|------|--------|---------|
| `validation_failed` | 400 | Payload fails Zod schema validation. |
| `insufficient_permissions` | 403 | Managed user attempting Power User action. |
| `protocol_not_found` | 404 | referenced protocol ID does not exist or is deleted. |
| `invalid_order_transition` | 409 | e.g. Trying to mark a DRAFT order as PAID. |
| `mtproto_connection_error` | 503 | Telegram service unreachable or session expired. |
| `audit_write_failed` | 500 | Database transaction rolled back due to audit failure. |
| `idempotency_key_conflict` | 409 | Key already used for a different payload. |

---

## 7. Sync Event Definition (TypeScript)

```typescript
type SyncEvent = {
  eventId: string; // UUID v4 used as Idempotency-Key
  type: 'LOG_DOSE' | 'SKIP_DOSE' | 'EDIT_DOSE';
  payload: {
    protocolId: string;
    scheduledDate: string; // ISO Date
    amount?: { value: number; unit: string };
    injectionSite?: { location: string; group: string };
    note?: string;
  };
  occurredAt: string; // ISO Timestamp
  timezone: string;   // IANA Name
};
```
