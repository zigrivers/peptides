<!-- scaffold:innovate-user-stories v1 2026-05-20 -->
# User Stories

**Status:** Draft (innovate-user-stories applied)
**Date:** 2026-05-20
**PRD source:** `docs/plan.md`
**Methodology:** deep | Depth: 5/5
**Innovation findings:** `docs/user-stories-innovation.md`

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
- **AC 5 (Placeholder):** If a compound is in the QSC catalog but the profile is not yet complete, I see a "Profile in progress" placeholder with the compound name and basic sourcing info instead of a 404.
- **AC 6 (Archived):** If a compound has been soft-deleted from the catalog but is still referenced by a protocol or dose log, the compound name is shown as "[Name] (archived)" with no active profile link, preserving FK integrity.
- **AC 7 (Persona disclosure — A6):** Given a Delegated Participant views a compound profile, when the page renders, then dosing range and administration route sections are expanded by default while mechanism, IUPAC name, and citations are collapsed behind a `Show more` control. Power Users see all sections expanded.

**Domain Events:** `CompoundProfileViewed`

---

### US-REF-02: Search & Browse Catalog
**As a** user,  
**I want to** search and filter the compound catalog,  
**so that** I can find peptides by name or physiological goal.

**Acceptance Criteria:**
- **AC 1 (Search):** Given I am in the catalog, when I type "sema", then "Semaglutide" appears in the filtered results.
- **AC 2 (Categories):** When I select the "Healing" category, only peptides tagged with healing/recovery (e.g., BPC-157, TB-500) are shown.
- **AC 3 (Recently viewed — A10):** Given the user has viewed at least one compound profile, when they enter the catalog screen, then a `Recently viewed` row showing their last 5 distinct compounds is rendered above the search and filter controls.

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
- **AC 5 (Frequencies):** I can configure protocol frequency as one of: daily, every other day (EOD), specific days of the week (e.g., Mon/Wed/Fri), or a custom interval in days. The generated schedule respects the chosen frequency.
- **AC 6 (Numeric input UX — A8, canonical for all dose/volume fields):** Given a dose-amount or BAC-volume input is rendered, when the user focuses it on a mobile device, then the decimal numeric keypad is presented (`inputmode='decimal'`) and the field has an accessible label describing the unit (mcg / mg / IU / mL). This pattern applies to every dose or volume input across US-TRK-01, US-TRK-03, and US-REC-01.
- **AC 7 (Smart protocol defaults — A16):** Given the user has a prior protocol for the selected compound, when they create a new protocol with that compound, then the dose amount, unit, frequency, and administration route are pre-filled from the user's most recent protocol for the same compound; fields remain editable before save.
- **AC 8 (Live syringe hint — A19):** Given the user has at least one active reconstituted vial for the selected compound, when they enter a dose amount in the protocol form, then the equivalent value in 100-unit insulin syringe units is shown as helper text below the input.
- **AC 9 (Assignee context — A20):** Given the user opens the assign-to control on a protocol form, when a managed user is selected, then a small list of that user's currently active protocols is rendered inline under the selection (e.g., `Also on: BPC-157, TB-500`).
- **AC 10 (Schedule preview — P9):** Given the user has selected a compound, dose, frequency, and start date, when they review the protocol form before saving, then the next 7 generated dose dates and the assignee are rendered as a preview list, with inline warnings for invalid interval, missing start date, or inactive assignee.

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
- **AC 5 (Undo — A4):** Given the user has just confirmed a dose, when the confirmation completes, then a toast with an `Undo` action appears for 5 seconds. Tapping `Undo` before dismissal removes the dose log entry and records an audit event with reason `"reverted within grace window"`.
- **AC 6 (Deviation guard — A18):** Given the user is logging a dose with a manually edited amount that deviates more than 50% from the scheduled protocol amount, when they attempt to confirm, then a confirmation dialog asks them to verify the amount before the log is written (the dialog cannot be auto-dismissed).
- **AC 7 (Local duplicate-tap protection — P6):** Given the user has tapped confirm on a scheduled dose (online or offline), when the row transitions to `queued` state immediately on tap, then a subsequent confirm tap on the same scheduled dose from the same device is rejected as a duplicate before any sync occurs. Idempotency is keyed to `(protocolId, scheduledDate, deviceId)`.

**Domain Events:** `DoseLogged`, `DoseSkipped`, `DoseSyncCompleted`

---

### US-TRK-04: Injection Site Rotation
**As a** user,  
**I want to** see a suggested injection site for my next dose,  
**so that** I avoid tissue trauma from repeated injections in the same spot.

**Acceptance Criteria:**
- **AC 1 (Suggestion):** The app suggests the next site in a round-robin rotation (e.g., Left Abdomen -> Right Abdomen) based on the history for that specific compound.
- **AC 2 (Visual):** I can see the last 7 sites used for the compound during the logging flow.
- **AC 3 (Selectable sites):** The available sites are: left abdomen, right abdomen, left thigh, right thigh, left deltoid, right deltoid, ventrogluteal L, ventrogluteal R. I can always override the suggestion before confirming.
- **AC 4 (Route awareness):** Sites are filtered by the compound's administration route (subcutaneous, intramuscular, etc.) — only valid sites for the active route are offered.
- **AC 5 (First dose):** When there is no prior history for a compound, no suggestion is shown and all valid sites are available as user choice.
- **AC 6 (Rest indicator — A7):** Given a dose is being logged with site rotation available, when the site picker is shown, then each candidate site displays `last used N days ago` (or `never` if unused), and sites unused ≥ 7 days are tagged `rested`. The list is available as structured text for screen readers (see US-ANL-01 AC 7).

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
- **AC 4 (Inline edit — A5):** Given the batch review list is shown with N pending doses, when the user taps a dose amount, then an inline numeric input opens defaulted to the protocol amount and accepts any positive Decimal value, recorded as `actual dose` on confirm.
- **AC 5 (Confirmation feedback — A14):** Given a batch dose confirmation succeeds, when the operation completes, then a short haptic pulse fires (where the Vibration API is supported) and each logged dose row plays a checkmark animation before collapsing into a `Today: N/N complete` summary card.
- **AC 6 (Safe preselection — P5):** Given the user opens the batch review list, when it is rendered, then any dose flagged as unavailable (zero vial inventory, no valid site for the active route, or missing protocol data) is shown unchecked with an inline warning. Unavailable doses cannot be batch-confirmed; the user must explicitly skip them or resolve the underlying issue via the per-row action.

**Domain Events:** `DoseBatchLogged`

---

### US-TRK-06: Subjective Outcome Logging
**As a** user,  
**I want to** rate my wellbeing and log notes daily,  
**so that** I can correlate my protocols with how I feel.

**Acceptance Criteria:**
- **AC 1 (Rating):** I can log an overall wellbeing rating (1-5) and select tags like "Energy" or "Pain".
- **AC 2 (Notes):** I can add a free-text note (max 1000 chars) to the daily log.
- **AC 3 (Tag presets — A11):** Given a user has logged outcome entries with tags in the past 14 days, when they open the outcome-logging UI, then their 3 most-frequent tags from that period are shown as one-tap presets above the full tag selector.

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
- **AC 4 (Push denied):** If I deny notification permission, the app surfaces a banner ("Enable notifications for dose reminders") with a link to browser settings and silently falls back to email delivery.
- **AC 5 (Email failure):** If email delivery fails, the failure is recorded in the application log but does not produce a user-facing error and is not retried (silent fail-soft is intentional for reminders).
- **AC 6 (Visible reminder — A15):** Given the user has a daily reminder time configured, when they view the dashboard, then `Next reminder: HH:MM` is displayed and tapping the indicator opens the reminder time editor inline.

**Domain Events:** `ReminderSent`, `ReminderDeliveryFailed`

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
- **AC 4 (Badge accessibility — A9, canonical):** Given any warning or status badge is rendered (low inventory, expiring vial, dose-above-range, large-volume warning, stale-data badge, etc.), when it is displayed, then the badge combines a color, an icon, and a text label. No warning is conveyed by color alone (WCAG 1.4.1).
- **AC 5 (Stale-data badge — A13):** Given the user is offline or the displayed data was fetched more than 30 minutes ago, when inventory, adherence, or dashboard tiles are rendered, then each tile shows a `Last refreshed HH:MM` indicator.
- **AC 6 (First-login empty state — A21):** Given a user has no active protocols and no dose logs, when they land on the dashboard, then a `Get started` card is shown. Power Users see actions for `Browse Catalog`, `Create Protocol`, and `Log First Dose`. Delegated Participants see the message `No dose scheduled today — your administrator will configure your protocol`. The card hides once the user has at least one active protocol.
- **AC 7 (Accessible text equivalents — P10, canonical):** Given any visual element on the dashboard, site rotation flow, or analytics chart represents data, when the element is rendered, then a screen-reader-accessible structured text equivalent exists. Site rotation history is exposed as a list (`Left abdomen — 3 uses, last 2 days ago`). The correlation timeline (US-TRK-07) is focusable and announces a data table containing the same dates, dose events, and outcome ratings. Warning badges announce status text via `aria-live` polite regions.
- **AC 8 (Delegated single-dose card — P8):** Given a Delegated Participant has exactly one dose due today, when they open the dashboard, then the dose is rendered as a single dominant card with `Confirm` and `Skip` as the only primary actions. No protocol creation, ordering, or configuration controls are shown.

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
- **AC 5 ("Use last" chip — A1, opt-in fill):** Given the user has previously reconstituted this compound, when they open the calculator with this compound selected, then an inert chip labeled `Use last: <volume>mL — <date>` is shown adjacent to the BAC water field. Tapping the chip populates the field with the prior value; the chip does NOT auto-fill the field on render.
- **AC 6 (Read-back summary — A3):** Given the calculator inputs are valid, when the user is about to record the reconstitution, then a single-sentence plain-English summary line is rendered above the Record button restating vial size, BAC volume, resulting concentration, and units-per-target-dose (e.g., `"5mg vial + 2.0mL BAC = 2.5mg/mL — 10 units gives 250mcg."`).
- **AC 7 (Visual syringe preview — P1):** Given the calculator has computed a non-zero unit value for the target dose, when the result is rendered, then a graphical 1mL insulin syringe is displayed alongside the numeric output, with the plunger drawn at the calculated unit mark and the measurement labelled.
- **AC 8 (Field-level guardrails + sticky summary — P2):** Given the user is editing any input on the calculator, when the field loses focus or recalculates, then field-level inline validation runs (zero/negative blocked, BAC < 0.5mL warning inline, vial size missing inline error, target dose above reference high-range warning inline). A sticky summary panel showing concentration, dose volume, and insulin-syringe units updates live as inputs change and remains visible while the user scrolls.

**Domain Events:** `ReconstitutionCalculated`

---

### US-REC-02: Record Reconstitution (Vial Inventory)
**As a** user,  
**I want to** save my reconstitution calculation as a new vial record,  
**so that** my dose logging can decrement from the vial's total content.

**Acceptance Criteria:**
- **AC 1 (Persistence — modified by A2):** Saving a calculation creates a `Vial` record with an estimated expiry date computed from the compound profile's `reconstituted shelf life` field (per PRD §5.1). If the profile field is empty, the default falls back to 14 days. Expiry remains editable before save.
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
- **AC 3 (Suggestion reason — A17):** Given a compound is in the Suggested section of the order builder, when it is rendered, then a reason string is shown next to it (e.g., `~8 doses remaining`, `vial expires in 3 days`, `no active vial recorded`). The reason explains why the compound was flagged for reorder.

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
- **AC 4 (Failed-send order queue — P4):** Given a Telegram MTProto send attempt fails (network error, session invalidated, rate limit, timeout), when the user navigates away and returns later, then the order remains in `Send failed` state with the composed message, vendor target, cart contents, and `send_method` history intact. A `Retry send` action is available, and the manual fallback options (copy message, open Telegram deep-link) are always accessible from the queue entry. The order is not silently discarded and never auto-transitions out of `Send failed` without explicit user action.

**Domain Events:** `OrderSent`, `OrderSendFailed`

---

### US-ORD-04: Payment Confirmation Safety Gate
**As a** Power User,  
**I want to** explicitly verify the vendor's wallet address and amount before marking payment as sent,  
**so that** I avoid non-reversible crypto payment errors.

**Acceptance Criteria:**
- **AC 1 (Gate):** I must enter the wallet address and amount from the vendor's reply.
- **AC 2 (Verification):** The "Mark Payment Sent" button is only enabled after I view a summary screen showing the address and amount together.
- **AC 3 (Duplicate send idempotency):** If I attempt to re-send an identical order message to the same vendor within 60 seconds of the previous send (e.g., via double-click or network retry), the app shows a "Possible duplicate — send again?" confirmation before proceeding.
- **AC 4 (Stale wallet warning):** When entering the wallet address, the app shows the wallet address from my most recent order to the same vendor for comparison, but requires me to verify the current address from the vendor's Telegram reply before "Mark Payment Sent" is enabled.
- **AC 5 (Chunked address display — A22):** Given the user is on the payment summary screen, when the wallet address is rendered, then it is displayed in monospace font broken into 4-character chunks separated by spaces, with the amount and currency shown directly above. The `Mark Payment Sent` button is placed below a required acknowledgment checkbox (`I have verified the wallet address and amount`) and is visually separated from copy-address and open-wallet actions to prevent fat-finger errors.
- **AC 6 (Wallet character diff — P3):** Given a previous confirmed wallet address exists for this vendor, when the payment confirmation gate renders, then the new and previous addresses are displayed in a side-by-side character-diff view with added/removed/changed characters highlighted. The `Mark Payment Sent` button remains disabled until the user explicitly taps `I have compared the addresses`. If no prior address exists for this vendor, the diff view is omitted and the acknowledgment label adapts to `I have verified this is the address from the vendor's current reply`.

**Domain Events:** `OrderPaymentConfirmed`, `DuplicateSendBlocked`

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

### US-ORD-09: Await Vendor Reply
**As a** Power User,  
**I want to** see clear "waiting for vendor confirmation" state after I send an order,  
**so that** I know the order is in flight and know where to go to read the vendor's reply.

**Acceptance Criteria:**
- **AC 1 (State):** After a successful Telegram send, the order detail screen shows the status "Sent — waiting for vendor confirmation" with the timestamp of the send.
- **AC 2 (Deep-link):** The screen surfaces a "Open vendor chat in Telegram" deep-link so I can read the reply directly in Telegram.
- **AC 3 (Manual capture):** A "Capture vendor reply" action lets me proceed to US-ORD-04 (Payment Confirmation Safety Gate) where I enter the confirmed total, currency, and wallet address from the vendor's message.

**Domain Events:** `OrderAwaitingVendorReply`

---

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
- **AC 1 (States):** Orders transition through: Draft -> Sent -> Confirmed -> Payment Sent -> Received (terminal). Cancelled is a separate terminal state reachable from any non-terminal status.
- **AC 2 (Stale):** If an order remains in "Sent" for 14 days, it is automatically flagged as "Stale" with a banner prompting the user to check Telegram and either update the status or cancel the order.
- **AC 3 (Cancel):** I can cancel any order in Draft, Sent, Confirmed, or Stale status from Order History. Cancelled orders remain in history with status, timestamp, and the actor's identity recorded in the audit log.
- **AC 4 (Forward-only):** Non-cancel status transitions are forward-only — an order in "Payment Sent" cannot move back to "Sent" without being cancelled and re-issued.

**Domain Events:** `OrderStatusChanged`, `OrderCancelled`, `OrderMarkedStale`

---

## Epic 5: Multi-User & Admin (ADM)

### US-ADM-01: Create Managed User
**As a** Power User,  
**I want to** create accounts for family members,  
**so that** I can manage their protocols without giving them admin access.

**Acceptance Criteria:**
- **AC 1 (Invite):** I can enter a name and email to send an invite link (valid for 72 hours).
- **AC 2 (Access):** Managed users see a simplified dashboard with only their own schedule and reference info.
- **AC 3 (Invite states):** The admin panel shows the invite status per user row: **Active** | **Invited (expires MM/DD)** | **Invite Expired** | **Deactivated**.
- **AC 4 (Resend invite):** From any "Invited" or "Invite Expired" row, I can resend the invite. Resending generates a new link and immediately invalidates the prior one. Resending to a user who has already accepted is not available — I use password reset instead.
- **AC 5 (Duplicate-invite guard):** Attempting to invite an email that already has an account shows "This email already has an account." Attempting to invite an email with a pending invite shows "An invite is already pending for this email. Resend or cancel it first."
- **AC 6 (Copy invite link — A12):** Given an invite has been generated for a managed user, when the admin views the invite-status row, then the invite link is shown alongside a copy-to-clipboard action. The email is sent in parallel; both paths land on the same one-time-use link.

**Domain Events:** `ManagedUserInvited`, `ManagedUserInviteResent`

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
- **AC 3 (Active-protocols warning):** When I attempt to deactivate a managed user with active protocols, the app shows a warning "This user has N active protocols. Deactivating their account will prevent them from logging doses. Continue?" and only proceeds on confirmation.
- **AC 4 (Mid-day deactivation behavior):** When I deactivate a protocol mid-day, the managed user's dashboard refreshes on next render (or polling tick) to remove the affected dose from "today's doses." Doses for that protocol already logged earlier today are preserved. If the managed user is mid-log when the deactivation lands, the in-flight log submission is accepted (last-writer-wins) and recorded against the now-deactivated protocol's history.

**Domain Events:** `ManagedUserDeactivated`, `PasswordResetTriggered`, `ProtocolDeactivated`

---

### US-ADM-04: Delete Managed User
**As a** Power User,  
**I want to** permanently delete a managed user's account with their data exported first,  
**so that** I can wind down their participation while honoring their right to a copy of their own data.

**Acceptance Criteria:**
- **AC 1 (Export first):** Initiating delete generates a full JSON export of the managed user's data (protocols, dose logs, vial records, outcome logs) and delivers it to me (the admin) by email before any deletion executes.
- **AC 2 (Double-confirm):** Deletion requires explicit acknowledgment of an irreversible-warning modal, and a 48-hour delay between confirmation and execution (or immediate execution with a second explicit confirmation).
- **AC 3 (Audit):** The deletion event is recorded in the audit log with my actor identity, the target user's identity, and a timestamp.
- **AC 4 (FK preservation):** Any references in the audit log to the deleted user's actions are preserved as historical records; only the user account and their tracker/order data are removed.
- **AC 5 (Super-admin guard):** I cannot delete my own super-admin account while any managed users are active — they must be deactivated or deleted first.

**Domain Events:** `ManagedUserDeletionRequested`, `ManagedUserDeleted`

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
- **AC 1 (Export):** I can request a full JSON export at any time. CSV export is provided for dose logs and orders. Exports < 10MB download immediately; exports ≥ 10MB are generated asynchronously and delivered by email within 5 minutes.
- **AC 2 (Deletion default):** After confirmation, all data is permanently wiped from the system after a 48-hour delay. During the 48-hour window the user can cancel the deletion by logging in.
- **AC 3 (Immediate deletion):** As an alternative to the 48-hour delay, the user can elect immediate deletion via a second double-acknowledgment modal ("I understand this is irreversible and I want to delete now").
- **AC 4 (Telegram session):** Account deletion revokes any stored Telegram MTProto session; the session is not included in the data export.

**Domain Events:** `AccountDeletionRequested`, `AccountDeletionCancelled`, `DataExportGenerated`

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
- **AC 3 (Persistent sync indicator — P7):** Given the app shell is rendered, when the user is online and synced, then a green sync indicator with last-sync timestamp (`Synced HH:MM`) is shown in the shell header. When offline with pending mutations, an amber indicator with queue count (`Offline — N queued`) is shown. When a sync attempt has failed, a red indicator (`Sync failed — Retry`) is shown with a retry action. Tapping the indicator opens a list of queued operations with their type, target, and timestamp.

**Domain Events:** `AppInstalled`, `SyncQueueViewed`, `SyncRetryRequested`

---

### US-AUT-06: Change Own Password
**As a** logged-in user,  
**I want to** change my password from account settings,  
**so that** I can rotate credentials without going through the password-reset email flow.

**Acceptance Criteria:**
- **AC 1 (Current-password gate):** Changing my password requires re-entering my current password before the new password is accepted; failure shows "Current password is incorrect" without distinguishing it from a wrong new password.
- **AC 2 (Strength rule):** The new password must satisfy the registration rule (minimum 12 characters); no maximum, no complexity requirements.
- **AC 3 (Same-as-current rejection):** The new password cannot be identical to the current password.
- **AC 4 (Session invalidation):** A successful password change invalidates all sessions other than the current one; my next visit on another device requires me to log in again.
- **AC 5 (Audit):** The password-change event is recorded in the audit log (no password values are logged — only the event, actor, and timestamp).

**Domain Events:** `PasswordChanged`, `OtherSessionsInvalidated`

---

### US-AUT-07: Change Own Email
**As a** logged-in user,  
**I want to** change the email address on my account,  
**so that** my login + notification emails follow me if I change provider.

**Acceptance Criteria:**
- **AC 1 (Current-password gate):** Changing my email requires re-entering my current password.
- **AC 2 (Verify-new-email gate):** A verification email is sent to the proposed new address; the email change does not take effect until the user clicks the verification link. The verification link expires in 24 hours.
- **AC 3 (Conflict check):** If the new email already has an account, I see "This email is already in use" without indicating whether the owner is myself.
- **AC 4 (Old-email notice):** Once the change takes effect, a notification email is sent to the *previous* email address ("Your email on Project Peptides was changed to <new>") with a link to revert within 48 hours if it was unauthorized.
- **AC 5 (Audit):** The email-change event (request, verify, complete) is recorded in the audit log.

**Domain Events:** `EmailChangeRequested`, `EmailChangeVerified`, `EmailChangeReverted`

---

## US Splitting Rationale
- **Pillar Splitting:** Stories are split by the four pillars (Reference, Tracker, Reconstitution, Ordering) to allow incremental delivery of value.
- **Admin vs User:** Managed user functionality is split from super admin functionality.
- **Security/Offline:** Critical non-functional requirements like Auth and PWA are elevated to Epic 6 to ensure they are prioritized as foundational.

## Dependency Graph (High Level)
- `US-AUT-03` (Registration) -> Foundation for all other stories.
- `US-AUT-06` (Change Password), `US-AUT-07` (Change Email) -> depend on `US-AUT-03`
- `US-TRK-01` (Create Protocol) -> depends on `US-REF-01` (View Compound)
- `US-REC-02` (Record Reconstitution) -> depends on `US-REC-01` (Calculate)
- `US-ORD-03` (Send Order) -> depends on `US-ORD-01` (Telegram MTProto)
- `US-ORD-09` (Await Vendor Reply) -> depends on `US-ORD-03`; precedes `US-ORD-04`
- `US-ADM-01` (Managed User) -> depends on `US-AUT-03` (Auth)
- `US-ADM-04` (Delete Managed User) -> depends on `US-ADM-01` and `US-AUT-02` (data-export flow shared)
