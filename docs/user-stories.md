# User Stories

**Status:** Draft  
**Date:** 2026-05-20  
**PRD source:** `docs/plan.md`  
**Methodology:** deep | Depth: 5/5

---

## Persona Journey Maps

### Journey: The Morning Routine (Power User)
1. **Wake up**: Opens app on phone (PWA).
2. **Dashboard**: Sees "Today's Doses" list.
3. **Log**: Taps "Log All Scheduled" (US-TRK-05).
4. **Confirm**: Reviews amounts and suggested sites, taps "Confirm All".
5. **Close**: App shell closes; user proceeds with day.

### Journey: The Sourcing Loop (Power User)
1. **Inventory Alert**: Receives alert that BPC-157 is running low (US-ORD-02).
2. **Order Builder**: Opens order builder; BPC-157 is pre-suggested (US-ORD-03).
3. **Cart**: Adds other compounds, reviews total.
4. **Send**: Taps "Send Order" (US-ORD-04). App sends Telegram message via MTProto.
5. **Payment**: Vendor replies on Telegram. User captures wallet address/amount in app (US-ORD-05).
6. **Confirmation**: User pays via Coinbase, marks "Payment Sent" in app.

---

## Epic 1: Reference Pillar (REF)

### US-REF-01: View Compound Profile
**As a** Power User or Managed User,  
**I want to** view a detailed profile for a peptide,  
**so that** I understand its mechanism, dosing, and safety profile without checking multiple sites.

**Acceptance Criteria:**
- **AC 1 (Given/When/Then):** Given I am on the dashboard, when I search for "BPC-157" and select it, then I see its IUPAC name, mechanism of action, and administration routes.
- **AC 2 (Citations):** Every researched benefit must include a clickable PubMed/DOI link.
- **AC 3 (Dosing):** Dosing ranges are displayed for low, typical, and high categories with protocol context.
- **AC 4 (Stacking):** If "Stacking Notes" exist, they are displayed prominently (e.g., "Commonly stacked with TB-500").

**Domain Events:** `CompoundProfileViewed`

---

### US-REF-02: Search & Browse Catalog
**As a** user,  
**I want to** search and filter the compound catalog,  
**so that** I can find peptides by name or physiological goal.

**Acceptance Criteria:**
- **AC 1 (Search):** Given I am in the catalog, when I type "sema", then "Semaglutide" appears in the filtered results.
- **AC 2 (Categories):** When I select the "Healing" category, only peptides tagged with healing/recovery (e.g., BPC-157, TB-500) are shown.

**Domain Events:** `CatalogSearched`, `CatalogFiltered`

---

## Epic 2: Tracker Pillar (TRK)

### US-TRK-01: Create and Edit Protocol
**As a** Power User,  
**I want to** create and edit a dosing protocol for a compound,  
**so that** I have a structured schedule for myself or a managed user.

**Acceptance Criteria:**
- **AC 1 (Setup):** Given I am creating a protocol, when I select "BPC-157" and set 250mcg daily, then the schedule is generated starting from the selected start date.
- **AC 2 (Assignment):** I can assign the protocol to myself or any of my managed users.
- **AC 3 (Validation):** Saving is blocked if compound or dose amount is missing.
- **AC 4 (Audit):** Every creation or modification of a protocol is recorded in the audit log.

**Domain Events:** `ProtocolCreated`, `ProtocolUpdated`

---

### US-TRK-02: Protocol Lifecycle (Pause, Resume, Clone, Restart)
**As a** Power User,  
**I want to** manage the lifecycle of my protocols,  
**so that** I can handle breaks, illness, or cycle restarts without data loss.

**Acceptance Criteria:**
- **AC 1 (Pause):** When I set a protocol status to "Paused", it no longer appears in "Today's Doses".
- **AC 2 (Resume):** When I resume a paused protocol, it immediately reappears in the daily dosing schedule.
- **AC 3 (Clone):** I can duplicate an existing protocol to a new start date, preserving the original's dose and frequency.
- **AC 4 (Restart):** I can "Restart Cycle" for a completed cycle, which clones all its protocols to a new start date.

**Domain Events:** `ProtocolPaused`, `ProtocolResumed`, `ProtocolCloned`, `CycleRestarted`

---

### US-TRK-03: Individual Dose Logging
**As a** user,  
**I want to** log a single dose or record a skip,  
**so that** I have an accurate record of my adherence and current injection site.

**Acceptance Criteria:**
- **AC 1 (Logging):** Given a pending dose on my dashboard, when I tap "Confirm", then the dose is recorded with the current timestamp and suggested site.
- **AC 2 (Skip):** I can explicitly tap "Skip" on a dose, which records it as a "skip" event (distinct from "not logged").
- **AC 3 (Offline):** Given I am offline, when I log a dose, then the log is queued in the app and synced to the server once I am back online.
- **AC 4 (Inventory):** If I try to log a dose for a compound with 0 vials remaining, a prominent warning is shown.

**Domain Events:** `DoseLogged`, `DoseSkipped`, `DoseSyncCompleted`

---

### US-TRK-04: Injection Site Rotation
**As a** user,  
**I want to** see a suggested injection site for my next dose,  
**so that** I avoid tissue trauma from repeated injections in the same spot.

**Acceptance Criteria:**
- **AC 1 (Suggestion):** The app suggests the next site in a round-robin rotation (e.g., Left Abdomen -> Right Abdomen) based on the history for that specific compound.
- **AC 2 (Visual):** I can see the last 7 sites used for the compound during the logging flow.

**Domain Events:** `InjectionSiteSuggested`

---

### US-TRK-05: Batch "Log All Scheduled" (Must Have)
**As a** Power User or Managed User,  
**I want to** log all my daily doses in one action,  
**so that** I can complete my morning routine in seconds.

**Acceptance Criteria:**
- **AC 1 (Batch Action):** Given I have 3 doses due today, when I tap "Log All Scheduled", then all 3 are marked as logged at their protocol amounts.
- **AC 2 (Review):** Before final confirmation, I see a list of what will be logged and can deselect or skip individual doses.
- **AC 3 (Offline):** Batch logs are queued while offline and synced upon reconnection.

**Domain Events:** `DoseBatchLogged`

---

### US-TRK-06: Subjective Outcome Logging
**As a** user,  
**I want to** rate my wellbeing and log notes daily,  
**so that** I can correlate my protocols with how I feel.

**Acceptance Criteria:**
- **AC 1 (Rating):** I can log an overall wellbeing rating (1-5) and select tags like "Energy" or "Pain".
- **AC 2 (Notes):** I can add a free-text note (max 1000 chars) to the daily log.

**Domain Events:** `OutcomeLogged`

---

### US-TRK-07: Outcome-Dose Correlation Timeline
**As a** user,  
**I want to** see my dose history and outcome ratings on a single chart,  
**so that** I can identify if a protocol is actually working.

**Acceptance Criteria:**
- **AC 1 (Visualization):** A dual-axis chart shows dose events (bars) and outcome ratings (line) over a 30-day or 90-day window.
- **AC 2 (Stats):** The UI displays the average outcome rating on "Dosed Days" vs "Non-Dosed Days".

**Domain Events:** `CorrelationTimelineViewed`

---

### US-TRK-08: Manage Cycles
**As a** Power User,  
**I want to** group my protocols into cycles with specific dates,  
**so that** I can track progress over time (e.g., "Week 3 of 12").

**Acceptance Criteria:**
- **AC 1 (Creation):** I can create a cycle with a name, start date, and optional end date.
- **AC 2 (Association):** I can link multiple protocols to a single cycle.
- **AC 3 (Display):** The dashboard shows the current week number for any active cycle.

**Domain Events:** `CycleCreated`, `CycleUpdated`

---

### US-TRK-09: Dose Reminders
**As a** user,  
**I want to** receive a notification when my doses are due,  
**so that** I don't forget to maintain my adherence.

**Acceptance Criteria:**
- **AC 1 (Config):** I can set a daily reminder time (e.g., 7:00 AM).
- **AC 2 (Push):** If I have the PWA installed, I receive a browser push notification at the set time.
- **AC 3 (Email):** If push is unavailable, the app sends an email reminder.

**Domain Events:** `ReminderSent`

---

## Epic 7: Analytics & Dashboards (ANL)

### US-ANL-01: Stack Overview Dashboard
**As a** user,  
**I want to** see a high-level summary of my active protocols and supply levels,  
**so that** I can assess my current stack at a glance.

**Acceptance Criteria:**
- **AC 1 (Summary):** Dashboard shows current week number and completion status for the active cycle.
- **AC 2 (Inventory):** Compounds with low vial inventory (< 14 days) are highlighted with a warning badge.
- **AC 3 (Ratings):** A 7-day average of my wellbeing ratings is displayed alongside adherence metrics.

**Domain Events:** `DashboardViewed`

---

## Epic 3: Reconstitution Pillar (REC)

### US-REC-01: Calculate Reconstitution
**As a** user,  
**I want to** calculate how much BAC water to add to a vial with safety guardrails,  
**so that** I achieve a precise concentration and avoid dosing errors.

**Acceptance Criteria:**
- **AC 1 (Math):** Given a 5mg vial, when I enter 2mL BAC water, then the app shows a concentration of 2.5mg/mL (2500mcg/mL).
- **AC 2 (Syringe Units):** Given a target dose of 250mcg, the app shows "10 units" on a 100-unit insulin syringe.
- **AC 3 (Guardrails):** A yellow warning is shown if: (a) dose exceeds the reference profile high range, (b) injection volume > 1.5mL, or (c) BAC water volume < 0.5mL.
- **AC 4 (Context):** The calculator displays my last logged dose for this compound to provide safety context.

**Domain Events:** `ReconstitutionCalculated`

---

### US-REC-02: Record Reconstitution (Vial Inventory)
**As a** user,  
**I want to** save my reconstitution calculation as a new vial record,  
**so that** my dose logging can decrement from the vial's total content.

**Acceptance Criteria:**
- **AC 1 (Persistence):** Saving a calculation creates a `Vial` record with an estimated expiry date (14 days default).
- **AC 2 (Inventory):** The dashboard shows a "Low Inventory" or "Expiring" badge when the vial is nearly empty or past its date.

**Domain Events:** `VialReconstituted`

---

## Epic 4: Ordering Pillar (ORD)

### US-ORD-01: Configure Telegram MTProto
**As a** Power User,  
**I want to** link my Telegram account to the app with clear fallback options,  
**so that** the app can send order messages directly to vendors while ensuring I can always order manually.

**Acceptance Criteria:**
- **AC 1 (Auth):** I can enter my phone number and the verification code from Telegram.
- **AC 2 (Encryption):** The session is stored AES-256 encrypted and is never returned to the UI.
- **AC 3 (Fallback):** Composed order messages and Telegram deep-links are always visible even if automation is enabled.

**Domain Events:** `TelegramAccountLinked`

---

### US-ORD-02: Inventory-Aware Order Builder
**As a** Power User,  
**I want to** see suggested items to order based on my current vial levels,  
**so that** I never run out of a compound I am currently using.

**Acceptance Criteria:**
- **AC 1 (Suggestions):** When I open the order builder, compounds with < 14 days of supply remaining are listed in a "Suggested" section.
- **AC 2 (Quick Add):** I can add suggested items to my cart with one tap.

**Domain Events:** `OrderSuggestionsGenerated`

---

### US-ORD-03: Build and Send Telegram Order
**As a** Power User,  
**I want to** build an order and have the app send it to the vendor's Telegram,  
**so that** I don't have to manually format and copy-paste messages.

**Acceptance Criteria:**
- **AC 1 (Cart):** I can add items from the vendor catalog to a cart.
- **AC 2 (MTProto Send):** Tapping "Send Order" sends the message via the linked Telegram account.
- **AC 3 (Audit):** The full text of the sent message is archived in the order history.

**Domain Events:** `OrderSent`

---

### US-ORD-04: Payment Confirmation Safety Gate
**As a** Power User,  
**I want to** explicitly verify the vendor's wallet address and amount before marking payment as sent,  
**so that** I avoid non-reversible crypto payment errors.

**Acceptance Criteria:**
- **AC 1 (Gate):** I must enter the wallet address and amount from the vendor's reply.
- **AC 2 (Verification):** The "Mark Payment Sent" button is only enabled after I view a summary screen showing the address and amount together.

**Domain Events:** `OrderPaymentConfirmed`

---

### US-ORD-05: Receive Order and Update Inventory
**As a** Power User,  
**I want to** mark an order as received and review items before they enter inventory,  
**so that** my vial records accurately reflect what arrived.

**Acceptance Criteria:**
- **AC 1 (Receive):** Marking as received opens a prompt to confirm which line items to add to inventory.
- **AC 2 (History):** The order status updates to "Received" with a timestamp.

**Domain Events:** `OrderReceived`

---

### US-ORD-08: Ordering Module Isolation (Non-Functional)
**As a** system administrator,  
**I want to** disable the ordering module via environment variable,  
**so that** I can comply with local regulations without affecting the tracker/reference pillars.

**Acceptance Criteria:**
- **AC 1 (Isolation):** When `DISABLE_ORDERING=true`, all `/ordering` routes return a 404 or 403.
- **AC 2 (UI):** When disabled, ordering navigation links are removed from the bottom bar.
- **AC 3 (Integrity):** Tracker and Reference catalog remain fully functional when Ordering is disabled.

---

### US-ORD-06: Manage Vendor Catalog
**As a** Power User,  
**I want to** maintain a catalog of vendor products and prices,  
**so that** the order builder has accurate data.

**Acceptance Criteria:**
- **AC 1 (Catalog):** I can create and edit products for a vendor (vial size, form, price, in-stock status).
- **AC 2 (Linking):** Every catalog product must be linked to a compound in the reference catalog.

**Domain Events:** `CatalogProductUpdated`

---

### US-ORD-07: Track Order Status (State Machine)
**As a** Power User,  
**I want to** track my order through its entire lifecycle,  
**so that** I can identify stale orders or missing shipments.

**Acceptance Criteria:**
- **AC 1 (States):** Orders transition through: Draft -> Sent -> Confirmed -> Payment Sent -> Received.
- **AC 2 (Stale):** If an order remains in "Sent" for 14 days, it is automatically flagged as "Stale".

**Domain Events:** `OrderStatusChanged`

---

## Epic 5: Multi-User & Admin (ADM)

### US-ADM-01: Create Managed User
**As a** Power User,  
**I want to** create accounts for family members,  
**so that** I can manage their protocols without giving them admin access.

**Acceptance Criteria:**
- **AC 1 (Invite):** I can enter a name and email to send an invite link (valid for 72 hours).
- **AC 2 (Access):** Managed users see a simplified dashboard with only their own schedule and reference info.

**Domain Events:** `ManagedUserInvited`

---

### US-ADM-02: Monitor Adherence
**As a** Power User,  
**I want to** see adherence metrics for my managed users,  
**so that** I know if they are following the protocols I configured.

**Acceptance Criteria:**
- **AC 1 (Dashboard):** The admin panel shows a 7-day adherence % (Doses Logged / Doses Scheduled) for each managed user.

**Domain Events:** `AdherenceReportViewed`

---

### US-ADM-03: Manage Managed Users
**As a** Power User,  
**I want to** edit, deactivate, or reset passwords for managed users,  
**so that** I can maintain control over the multi-user environment.

**Acceptance Criteria:**
- **AC 1 (Management):** I can deactivate a managed user account, which revokes their access but preserves their data.
- **AC 2 (Password Reset):** I can trigger a password reset email for any managed user.

**Domain Events:** `ManagedUserDeactivated`, `PasswordResetTriggered`

---

## Epic 6: Auth & Account Management (AUT)

### US-AUT-01: Onboarding Path (Power User vs Managed User)
**As a** new user,  
**I want to** be guided through my role-specific setup,  
**so that** I understand how to use the app immediately.

**Acceptance Criteria:**
- **AC 1 (Power User Wizard):** 3-step guide: Browse Catalog -> Create Protocol -> Optional Telegram Setup.
- **AC 2 (Managed User Wizard):** 2-step guide: View My Schedule -> Log First Dose walkthrough.

**Domain Events:** `OnboardingStarted`, `OnboardingCompleted`

---

### US-AUT-02: Account Deletion and Data Export
**As a** user,  
**I want to** delete my account and receive a full export of my data,  
**so that** I maintain full control over my sensitive health-adjacent information.

**Acceptance Criteria:**
- **AC 1 (Export):** I can request a full JSON export at any time. CSV export is provided for dose logs and orders.
- **AC 2 (Deletion):** After confirmation, all data is permanently wiped from the system after a 48-hour delay.

**Domain Events:** `AccountDeletionRequested`, `DataExportGenerated`

---

### US-AUT-03: User Registration and Login
**As a** user,  
**I want to** securely register and log in to the app,  
**so that** my private protocol data is protected.

**Acceptance Criteria:**
- **AC 1 (Auth):** I can register with email and a 12-character minimum password.
- **AC 2 (Sessions):** Sessions use secure httpOnly cookies with 30-day rolling expiry.

**Domain Events:** `UserRegistered`, `UserLoggedIn`

---

### US-AUT-04: Password Reset
**As a** user,  
**I want to** reset my password if I forget it,  
**so that** I don't lose access to my dose history.

**Acceptance Criteria:**
- **AC 1 (Request):** I can request a reset link via email. The link is single-use and expires in 1 hour.
- **AC 2 (Privacy):** The app does not reveal if an email is registered during the reset request flow.

**Domain Events:** `PasswordResetRequested`, `PasswordChanged`

---

### US-AUT-05: PWA & Offline Support
**As a** user,  
**I want to** install the app on my home screen and use it without signal,  
**so that** I can log my 7:00 AM doses regardless of connectivity.

**Acceptance Criteria:**
- **AC 1 (Install):** The app provides a manifest and service worker for home screen installation on iOS and Android.
- **AC 2 (Offline Shell):** The app shell loads instantly even without an internet connection.

**Domain Events:** `AppInstalled`

---

## US Splitting Rationale
- **Pillar Splitting:** Stories are split by the four pillars (Reference, Tracker, Reconstitution, Ordering) to allow incremental delivery of value.
- **Admin vs User:** Managed user functionality is split from super admin functionality.
- **Security/Offline:** Critical non-functional requirements like Auth and PWA are elevated to Epic 6 to ensure they are prioritized as foundational.

## Dependency Graph (High Level)
- `US-AUT-03` (Registration) -> Foundation for all other stories.
- `US-TRK-01` (Create Protocol) -> depends on `US-REF-01` (View Compound)
- `US-REC-02` (Record Reconstitution) -> depends on `US-REC-01` (Calculate)
- `US-ORD-03` (Send Order) -> depends on `US-ORD-01` (Telegram MTProto)
- `US-ADM-01` (Managed User) -> depends on `US-AUT-03` (Auth)
