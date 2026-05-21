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
   - **Stale-wallet comparison** (US-ORD-04 AC 4): below the wallet-address input, the UI displays the wallet address from the user's most recent order to the same vendor with a "compare with prior" label. The user must still verify against the current vendor reply — the prior address is shown for reference only and does NOT auto-populate.
2. **Review Screen**: App displays entered details in a high-contrast block, with: confirmed total (large), currency, wallet address (monospace), copy-to-clipboard buttons on each.
3. **Safety Check**: User must tap "Details Match Vendor Message" checkbox; the "Mark Payment Sent" button remains disabled until the checkbox is checked.
4. **Mark Paid**: "Mark Payment Sent" button enabled. On tap → API `mark-paid` with `acknowledged: true` (server-side double-check).
5. **Terminal State**: Transition to "Payment Sent" with instructions to wait for vendor receipt; "Mark Received" CTA appears once the user has confirmation in their Telegram.

**Duplicate-send modal** (US-ORD-04 AC 3, US-ORD-09 cross-cut): if the user taps "Send Order" twice within 60 seconds with an identical composed message (e.g., from a double-tap or network retry), an inline modal shows: "We may have just sent this order. Did you want to send it again?" with buttons "No, cancel" (default) and "Yes, send again" (requires explicit tap).

### 2.3 Flow: First-Run Onboarding
- **Power User**: 3 Steps (Browse Catalog -> Create Protocol -> Telegram MTProto setup).
- **Managed User**: 2 Steps (Intro Video -> Log First Dose walkthrough).
- **Exit**: "Getting Started" checklist persists on dashboard until 100% complete.

### 2.4 Flow: Reconstitution Calculator
1. User enters Vial Mg and BAC water Ml.
2. User enters Target Dose Mcg.
3. **Real-time Math**: Concentration (both mg/mL and mcg/mL) and Syringe Units update instantly.
4. **Cross-check display** (PRD §5.3): three small cells below the main syringe-units output show units for the compound profile's **low**, **typical**, and **high** doses — so the user can confirm their target dose is in a sensible range vs. the reference. If the compound has no profile, the cross-check cells show "n/a" and the calculator still works.
5. **Last-dose context**: a contextual line above the inputs displays "You logged X mcg yesterday at HH:MM" if a recent dose exists for this compound.
6. **Safety Warnings**: Yellow banners appear if Volume > 1.5mL, BAC < 0.5mL, or computed dose exceeds the profile's high range. Warnings are non-blocking; users can save anyway.
7. **Save**: User taps "Save to Inventory"; creates active Vial record.

---

### 2.5 Flow: Change Own Password (US-AUT-06)
1. User navigates to Settings → Security → Change Password.
2. Form fields: Current Password, New Password, Confirm New Password. All masked; show-password toggle on each.
3. Inline validation: length ≥ 12 chars; "new ≠ current" client-check (server enforces).
4. On submit: API `change-password`. Errors map to inline messages — the same `current_password_invalid` code maps to "Current password is incorrect" placed under the Current Password field (server avoids field-leak, but the UI can attribute since the user's intent is clear).
5. **Success modal**: "Password changed. We signed you out everywhere else for security. You'll need to log in again on your other devices." Modal explicitly mentions `otherSessionsRevoked: N` count.

### 2.6 Flow: Change Own Email (US-AUT-07)
1. User navigates to Settings → Account → Change Email.
2. Form: Current Password, New Email.
3. On submit: API `change-email-request`. Success screen: "We sent a verification link to <newEmail>. Click the link to complete the change. Link expires in 24 hours."
4. **Verification**: clicking the link in the new-address email lands on `/account/email-change/verify?token=...`. Success: "Email updated. You'll receive a notice at <oldEmail> with a revert link, valid for 48 hours."
5. **Old-address notice**: the old address receives an email "Your account email was changed to <newEmail>. If this wasn't you, click here to revert within 48 hours."
6. **Revert flow**: revert link lands on `/account/email-change/revert?token=...`. Success: "Email reverted to <oldEmail>. The new email change has been cancelled."

### 2.7 Flow: Account Deletion (US-AUT-02)
1. User navigates to Settings → Account → Delete Account.
2. Modal step 1: warning text + 5-character confirmation prompt ("type DELETE to continue") + mode select (radio: "Delay 48 hours" default, "Delete immediately").
3. Modal step 2 (immediate mode only): second confirmation modal "I understand this is irreversible and I want to delete now" + checkbox.
4. **Export-first**: A separate "Export my data first" link is prominent in the modal; clicking initiates an async export and emails the download link before any deletion.
5. **Submit (delayed mode)**: API `schedule-deletion`. Success: "Your account is scheduled for deletion on YYYY-MM-DD. Log in any time before then to cancel."
6. **Cancel window**: while in the 48h window, the user's next login lands on a banner: "Account deletion scheduled for YYYY-MM-DD HH:MM. [Cancel deletion]". Tapping cancels via API `cancel-deletion`.

### 2.8 Flow: Managed User Invitation (US-ADM-01)
1. Admin panel → "Invite Managed User" CTA.
2. Form: Name, Email. Submit → API `invite-user`. Errors: "This email already has an account" or "An invite is already pending for this email. [Resend]".
3. Success state: invite row appears in managed user list with badge "Invited (expires MM/DD)".
4. **Resend**: from the invite row's overflow menu → "Resend invite". Confirmation modal: "This will invalidate the prior invite link and send a new one." Continues → API `resend-invite`.
5. **Expired state**: when `expiresAt` passes without acceptance, badge changes to "Invite expired" and the resend action is the primary CTA on the row.

### 2.9 Flow: Delete Managed User (US-ADM-04)
1. Admin panel → managed user row → overflow menu → "Delete user".
2. Modal: warning + "Type the user's email to confirm" + mode select (Delay 48h / Immediate).
3. **Export-first** (non-negotiable): the modal shows "We'll email you a full data export of <user>'s data before the deletion executes." This is automatic — not a separate user action.
4. Submit → API `delete-managed-user`. Success screen: "An export of <user>'s data has been emailed to you. The account will be deleted on YYYY-MM-DD." (or "immediately" for immediate mode).
5. **Audit log**: this event is prominently visible in the Admin Audit Log view (separate page).

### 2.10 Flow: Order Lifecycle Management (US-ORD-07)
1. **Order History** view: list of all orders with status badges (Draft, Sent, Confirmed, Payment Sent, Received, Cancelled, **Stale**).
2. **Stale banner**: orders in Sent status for ≥ 14 days display a prominent yellow banner "This order has been waiting for vendor confirmation for 14+ days. [Check in Telegram] [Cancel order]".
3. **Cancel action**: available on any non-terminal order via overflow menu → "Cancel order". Confirmation modal with optional reason field. On submit → API `cancel-order`. Status changes to Cancelled; row moves to "Cancelled" filter group.
4. **Cancelled orders**: remain in history (never deleted); show grey badge with cancellation timestamp.

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
  - **State variants**: `Loading` (skeleton) | `Available` (full profile) | `InProgress` (placeholder card "Profile in progress — check back soon") | `Archived` (greyed compound name "[Name] (archived)" with no profile link, per US-REF-01 AC 5+6).

### 3.5 Reconstitution Context
- `ReconstitutionCalculator`: Vial size input, BAC water input, target dose input, live concentration display (mg/mL + mcg/mL), prominent syringe-units output, low/typical/high cross-check row, last-logged-dose context line, save-to-inventory button.
- `VialList`: Inventory grid; per-vial badges (Reconstituted, Empty, **Expiring in N days**, **EXPIRED**).
- `VialDetailSheet`: Side-drawer with reconstitution details, dose history attached to this vial, edit and soft-delete actions.

### 3.6 Admin Context (Power-User-only)
- `AdminPanel`: Top-level layout for `/admin/*` routes; permission guard rejects managed-user role with `/403`.
- `ManagedUserList`: Table with columns: name, email, last login, invite status badge, 7-day adherence %, overflow menu.
  - **Variants**: `Empty` (CTA to invite first user) | `Loaded` | `Loading`.
- `InviteUserDialog`: Form (name + email); inline error states for `invite_email_exists` and `invite_already_pending` (latter offers Resend inline).
- `ManagedUserDetailSheet`: dose history view, active protocol list, adherence chart, admin actions (deactivate, delete, reset password).
- `AdminAuditLogView`: paginated audit-event list filtered to admin actions.

### 3.7 Settings Context
- `SettingsLayout`: tabbed layout (Account, Security, Reminders, Privacy, Data).
- `ChangePasswordForm`: current + new + confirm fields; success modal explicitly mentioning the session-invalidation count.
- `ChangeEmailForm`: current password + new email; success card showing "Verification email sent to <newEmail>".
- `EmailChangeVerifyPage`: `/account/email-change/verify?token=...` — success / expired-token / invalid-token states.
- `EmailChangeRevertPage`: `/account/email-change/revert?token=...` — success / window-elapsed states.
- `ExportDataPanel`: format selector (JSON / CSV / Both), recent-exports list with download links + expiry badges.
- `DeleteAccountDialog`: type-to-confirm input, mode selector (Delayed 48h / Immediate with double-confirm), export-first CTA.
- `DeletionPendingBanner`: shown at top of every page during the 48h cancel window with `[Cancel deletion]` action.

### 3.8 Reminders Settings
- `ReminderPreferenceForm`: time picker (HH:MM), timezone (auto-detected from browser + override), channel select (Push / Email / Both), enabled toggle.
- `PushPermissionBanner`: shown when `pushPermissionState !== Granted`: "Enable notifications for dose reminders" with browser-settings deep-link; on iOS Safari, additionally shows "Install to home screen first" with the install prompt.
- `PushSubscriptionStatus`: small inline indicator showing current state (Subscribed / Denied / Not prompted).

### 3.9 Cycle Management
- `CycleList`: per-cycle card with name, dates, current-week indicator, status badge.
- `CycleForm`: create/edit; date range, optional scheduled breaks (DateRange[]).
- `RestartCycleDialog`: confirmation modal that lists which protocols will be cloned.

### 3.10 Outcome Logging
- `OutcomeLogForm`: overall rating slider (1-5), tag multi-select, per-protocol rating accordion (optional), note textarea (max 1000 chars).
- `OutcomeTimeline`: 14-day strip with per-day rating dots and clickable note popovers.

---

## 4. Accessibility Requirements (WCAG 2.1 AA)

- **Focus Management**: Focus trapping in all modals/sheets (`ProfileSheet`, `OrderBuilder`, `DeleteAccountDialog`, `InviteUserDialog`, `RestartCycleDialog`, `PaymentGate review screen`).
- **Aria-Live polite regions**: `Syncing...`, `Calculation Warning`, `Saved`, `Reminder Subscribed`, `Order Sent`, `Payment confirmed`.
- **Aria-Live assertive regions**: ordering safety-gate state changes (`Payment Sent`), reconstitution `Above-range warning`, session-revoked toast on password change.
- **Contrast**: 4.5:1 text contrast; 3:1 for graphical objects (charts/icons); critical warnings 7:1 (AAA tier).
- **Targets**: 44x44px minimum for all action buttons, including dose `Confirm` / `Skip` / `Log All Scheduled`.
- **Keyboard**: Escape closes all sheets/modals; logical Tab order in forms; ordering safety-gate checkbox is keyboard-toggleable; pin-input components (auth verification) accept paste.
- **Chart accessibility**: `OutcomeChart` and `CorrelationTimeline` provide an alternative tabular view toggled by a button; chart values are exposed via `aria-label` per data point.
- **PWA install prompt**: iOS Safari install prompt must be reachable via keyboard from the "Enable notifications" banner (US-TRK-09 + ADR-007). The prompt itself is a OS-level UI but the banner trigger must be keyboard-accessible and screen-reader-announced.
- **Multi-step forms**: each step exposes `aria-current="step"` on its indicator; back/next buttons are keyboard-focusable in DOM order.
- **High-contrast mode**: tested in Windows High Contrast and macOS Increased Contrast at minimum quarterly.

---

## 5. Responsive Behavior

| Component | Mobile (<640px) | Tablet (640-1024px) | Desktop (>1024px) |
|-----------|-----------------|---------------------|-------------------|
| **Navigation** | Bottom Bar | Side Rail (Icons) | Side Drawer (Labels) |
| **Dose List** | Full-width cards | 2-column grid | 3-column grid |
| **Calculator** | Stacked inputs | Side-by-side math | Side-by-side math |
| **Safety Gate** | Full-screen modal | Centered dialog | Centered dialog |
| **OrderBuilder** | Stacked vendor → cart → review | Side-by-side catalog + cart | Three-column: catalog + cart + recently-ordered |
| **OutcomeLog form** | Full-screen sheet | Side-drawer | Side-drawer |
| **ManagedUserList (admin)** | Card list with overflow menu | Table with overflow menu | Table with inline actions |
| **AdminPanel layout** | Stacked panels | Split (list + detail) | Split (list + detail) |
| **Reconstitution cross-check** | Stacked below main syringe-units output | Inline 3-cell row | Inline 3-cell row |
| **Settings tabs** | Bottom tab bar (mobile-OS pattern) | Top tab bar | Side rail |

---

## 6. Animation & Transition Specs

- **Reduced Motion**: All animations disabled if `prefers-reduced-motion` is active.
- **Loading**: Skeleton loaders for Catalog and Dashboard data fetching.
- **Mutations**: Submit button transitions to "Success" checkmark (200ms ease-out).
