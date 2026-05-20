# UX Specification

**Status:** Draft  
**Date:** 2026-05-20  
**PRD source:** `docs/plan.md`  
**User Stories source:** `docs/user-stories.md`  
**API Contracts source:** `docs/api-contracts.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Interaction State Machines

### 1.1 Form Interaction (Standard CRUD)
```
IDLE -> DIRTY (on input)
DIRTY -> VALIDATING (on blur/submit)
VALIDATING -> INVALID (show inline errors) -> DIRTY
VALIDATING -> SUBMITTING (show spinner, disable button)
SUBMITTING -> SUCCESS (show checkmark/toast)
SUBMITTING -> ERROR (show global banner, keep data) -> DIRTY
```

### 1.2 PWA Sync Interaction (Idempotent)
```
ONLINE -> OFFLINE (show "Offline Mode" banner)
OFFLINE -> QUEUED (dose logged locally in IndexedDB)
QUEUED -> SYNCING (network restored)
SYNCING -> SYNCED (hide banner, update dashboard)
SYNCING -> WARNING (show "1 sync failure" toast with retry)
```

---

## 2. Key User Flows

### 2.1 Flow: The 7:00 AM Routine (Dose Logging)
- **Entry**: Dashboard PWA Home Screen.
- **Happy Path**:
  1. User sees "Today's Doses" list.
  2. User taps "Confirm All".
  3. UI shows Review Sheet with pre-filled Protocol amounts.
  4. User verifies site rotation suggestion (last 7 sites visible).
  5. User taps "Verify & Log".
  6. Success toast appears; doses move to history.

### 2.2 Flow: The Ordering Safety Gate
1. **Confirm Quote**: User enters quoted total, currency, and wallet address from vendor's Telegram message.
2. **Review Screen**: App displays entered details in high-contrast block.
3. **Safety Check**: User must tap "Details Match Vendor Message" checkbox.
4. **Mark Paid**: "Mark Payment Sent" button enabled.
5. **Terminal State**: Transition to "Payment Sent" with instructions to wait for vendor receipt.

### 2.3 Flow: First-Run Onboarding
- **Power User**: 3 Steps (Browse Catalog -> Create Protocol -> Telegram MTProto setup).
- **Managed User**: 2 Steps (Intro Video -> Log First Dose walkthrough).
- **Exit**: "Getting Started" checklist persists on dashboard until 100% complete.

### 2.4 Flow: Reconstitution Calculator
1. User enters Vial Mg and BAC water Ml.
2. User enters Target Dose Mcg.
3. **Real-time Math**: Concentration and Syringe Units update instantly.
4. **Safety Warnings**: Yellow banners appear if Volume > 1.5mL or BAC < 0.5mL.
5. **Save**: User taps "Save to Inventory"; creates active Vial record.

---

## 3. Component Hierarchy (Implementation Specs)

### 3.1 Layout & Auth
- `AppShell`: PWA Container, Bottom Navigation, ErrorBoundary.
- `AuthForm`: Login/Register variants, password strength meter.
- `OnboardingWizard`: Multi-step transition container.

### 3.2 Tracker Context
- `DoseList`: `Pending` | `Logged` | `Skipped` variants.
- `ProtocolCard`: Status toggle (Active/Pause), Dose/Frequency display.
- `OutcomeChart`: Dual-axis correlation timeline (Rating vs Dosed days).

### 3.3 Ordering Context
- `OrderBuilder`: Vendor select, Product cart, total calculator.
- `PaymentGate`: Confirmation block, copy buttons, acknowledgement checkbox.
- `MTProtoLink`: Phone number input, OTP code verification.

### 3.4 Reference Context
- `CompoundCatalog`: Search bar, category filter tabs.
- `ProfileSheet`: Side-drawer with mechanism, dosing tables, and citation links.

---

## 4. Accessibility Requirements (WCAG 2.1 AA)

- **Focus Management**: Focus trapping in `ProfileSheet` and `OrderBuilder` modals.
- **Aria-Live**: "Syncing..." and "Calculation Warning" announced to screen readers.
- **Contrast**: 4.5:1 text contrast; 3:1 for graphical objects (charts/icons).
- **Targets**: 44x44px minimum for all action buttons (Confirm/Skip).
- **Keyboard**: Escape key closes all sheets/modals; logical Tab order in forms.

---

## 5. Responsive Behavior

| Component | Mobile (<640px) | Tablet (640-1024px) | Desktop (>1024px) |
|-----------|-----------------|---------------------|-------------------|
| **Navigation** | Bottom Bar | Side Rail (Icons) | Side Drawer (Labels) |
| **Dose List** | Full-width cards | 2-column grid | 3-column grid |
| **Calculator** | Stacked inputs | Side-by-side math | Side-by-side math |
| **Safety Gate** | Full-screen modal | Centered dialog | Centered dialog |

---

## 6. Animation & Transition Specs

- **Reduced Motion**: All animations disabled if `prefers-reduced-motion` is active.
- **Loading**: Skeleton loaders for Catalog and Dashboard data fetching.
- **Mutations**: Submit button transitions to "Success" checkmark (200ms ease-out).
