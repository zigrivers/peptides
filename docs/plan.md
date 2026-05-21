<!-- scaffold:create-prd v1 2026-05-20 -->
<!-- scaffold:review-prd v1 2026-05-20 -->
<!-- scaffold:innovate-prd v1 2026-05-20 -->
# Product Requirements Document

**Status:** Draft  
**Date:** 2026-05-20  
**Vision source:** `docs/vision.md` (scaffold:vision v2 + innovate-vision v1)  
**Methodology:** deep | Depth: 5/5

---

## 1. Problem Statement

**User group:** Advanced biohackers who self-direct multi-compound protocols (peptides, and in the near term TRT/anabolics) using grey-market vendors operating via Telegram.

**Pain:** Each of the four critical weekly tasks — researching a compound, placing an order, reconstituting a vial, and logging a dose — requires a different tool (browser/Obsidian, Telegram/PDF, a calculator, a spreadsheet). None of these tools know about each other. The user is the integration layer, and errors at any step translate to real harm: wrong reconstitution dose, lost crypto payment, or a missed injection.

**Scope of the problem:** Reddit r/Peptides has 250k+ members; the grey-market peptide vendor ecosystem sustains dozens of active Telegram-based vendors. Ordering errors in this context are non-reversible — crypto payments cannot be recalled if sent to the wrong wallet address or for the wrong amount. Estimated median order value: $100–500 USD per transaction. Manual reconstitution errors (wrong BAC water volume → wrong concentration) translate directly to dosing errors in the next injection.

**Hypothesis:** If we unify the four workflows (reference, ordering, reconstitution math, and dose tracking) into a single web app where each step is aware of the others, the Power User will abandon their existing four-tool workflow within 90 days and place at least 20 successful orders via the app within 12 months.

**Validation method:** Power User daily active use, spreadsheet and Obsidian notes decommissioned (self-reported), order history in app ≥ 20 successful orders in Year 1.

---

## 2. Target Users

### 2.1 Primary Persona — *Power User / Super Admin*

| Dimension | Detail |
|-----------|--------|
| **Description** | Self-directed biohacker running 3–7 concurrent peptide protocols; manages sourcing independently. Also manages peptide access for 2–10 family members or close friends. |
| **Primary need** | One tool that connects research → ordering → reconstitution → daily dosing → outcome logging without the user being the integration layer. |
| **Current behavior** | Obsidian for research notes, browser tabs for PubMed, Telegram for vendor orders, Coinbase for crypto payments, spreadsheet for dose logging, a calculator tab for reconstitution math, calendar notes for cycle tracking. |
| **Constraints** | Solo builder (is also the developer). Dose window is 3–5 minutes at 7am. Uncomfortable with "research use only" compliance theater. |
| **Success looks like** | Opens one app at 7am. Sees today's stack. Logs doses in < 60 seconds. At order time: builds order in app, app sends Telegram message to vendor automatically, user confirms crypto payment, inventory updates. Spreadsheet decommissioned within 90 days. |
| **Admin role** | Creates and configures managed user accounts. Configures protocols for Delegated Participants. Can view all managed users' adherence dashboards. |

### 2.2 Secondary Persona — *Delegated Participant (managed user, v1)*

| Dimension | Detail |
|-----------|--------|
| **Description** | Family member or close friend on 1–2 peptides, guided by the Power User. Does not self-research or order independently. |
| **Primary need** | See their daily injection schedule, confirm doses, and understand what they're taking — without navigating a complex interface. |
| **Current behavior** | Texting the Power User for every question. Sometimes guessing the dose. Sometimes skipping out of uncertainty. |
| **Constraints** | Non-technical. Low tolerance for complexity. Cannot configure their own protocol. First reconstitution done with Power User present. |
| **Success looks like** | Opens app, sees "today: 250mcg BPC-157, left abdomen." Taps confirm. Closes app. Zero texts to the Power User asking "how much do I take?" |
| **v1 scope** | Account created and protocol configured *by Power User only*. No self-serve onboarding. No ordering capability. Simplified view: schedule + dose logging + peptide info only. |

### 2.3 Adjacent Audience (v2 horizon, not v1)
- **TRT / anabolic users** — same Telegram/crypto ordering ecosystem; v1 architecture supports, v2 adds compound profiles
- **Compounding pharmacy patients** — bridge-sourcing architecture ready; UX deferred to v2

### 2.4 Non-Users (explicitly out of scope for v1)
- Clinicians and prescribers
- Mass-market wellness consumers / GLP-1-curious newcomers
- Anonymous SEO visitors
- Anyone seeking AI-personalized dose recommendations

---

## 3. Feature Scope Summary

### 3.1 In Scope (v1)

| Pillar | Features |
|--------|----------|
| **Reference** | Peptide profile pages (mechanism, dosing, citations, side effects, stacking notes); browse/search catalog; ~20–30 compounds seeded from QSC vendor catalog |
| **Tracker** | Protocol creation + management + clone/restart + pause/resume; daily dose logging with batch "Log All Scheduled"; injection site rotation; cycle management; subjective outcome logging; vial inventory with expiry warnings; stack overview dashboard; dose reminders; outcome-dose correlation timeline |
| **Reconstitution** | BAC water + concentration calculator; syringe unit calculator; integration with dose history and vial inventory |
| **Ordering** | Vendor catalog (QSC-first); inventory-aware order builder (suggests compounds running low); automated Telegram message dispatch via MTProto; payment capture checklist; order history; inventory update on delivery |
| **Multi-user** | Super admin panel; managed user account creation; protocol assignment to managed users; adherence visibility; simplified managed-user view |
| **Auth** | Email/password accounts; secure sessions; password reset; account deletion with data export; first-run setup wizard; PWA / home screen install |

### 3.2 Out of Scope (will NOT be built in v1)
- AI-generated dose recommendations or stack optimization
- Community features (forums, shared stacks, outcome comparisons, leaderboards)
- Public reference site / SEO landing pages
- App Store distribution (iOS, Android native apps)
- Automated Telegram response parsing (v2)
- Automated crypto payment execution (manual payment only)
- Wearable integration (Oura, Whoop)
- Lab data / bloodwork import and protocol correlation
- TRT/anabolic compound profiles (architecture supports; profiles deferred)
- Compounding pharmacy order flow (architecture allows; UX deferred)
- Self-serve managed-user onboarding (Delegated Participants created by Power User only)
- Multi-vendor ordering (QSC only; additional vendors = v2)
- Paid license / billing system (legal review required first; family/friends use for free)

### 3.3 Deferred (v2+)

| Feature | Why deferred |
|---------|-------------|
| AI Telegram response parser | Requires persistent Telegram read + AI parsing; v1 handles vendor reply manually. **v2 stub:** reads vendor's reply message from Telegram chat history, extracts confirmed total + wallet address + line items, pre-fills the payment confirmation screen. Requires: message-read MTProto scope, AI extraction layer (LLM or regex), idempotent order-update endpoint. |
| Automated PubMed watch | Background AI job + notification system; not needed for personal-tool phase. **v2 stub:** user subscribes to compounds; background job queries PubMed API weekly for new papers mentioning subscribed compounds; sends email digest with titles, abstracts, and DOI links. Requires: PubMed API integration, background job runner, email digest template, notification preferences UI. |
| Lab data import + protocol correlation | High technical complexity; validates after core tracking is proven |
| TRT/anabolic compound profiles | Same toolchain; v2 adds compound-type profiles and protocol templates |
| Multi-vendor ordering | Single vendor first to validate the ordering flow |
| Community features | Anti-vision for v1; opt-in Year 2 only if personal-tool adoption succeeds |
| Compounding pharmacy sourcing | Bridge-sourcing architecture ready; UX deferred |
| Public reference + SEO | Year 2 if personal-tool phase validates value |
| Paid license / billing | Before paid launch: legal review required (see §7.5) |

---

## 4. MoSCoW Prioritization

### Must Have — v1 launch is blocked without these
- Dose logging: confirmed date/time/amount/compound; Power User and Delegated Participant both log
- **Batch "Log All Scheduled"**: one-tap action to confirm all of today's doses at protocol amounts
- Protocol management: create/edit/deactivate/pause/resume a protocol with compound, dose, and schedule
- **Protocol clone / restart**: duplicate a protocol or restart a completed cycle with a new start date
- Reconstitution calculator: BAC water volume, syringe units, pre-filled from active protocol
- **Vial expiry + low-inventory warning**: dashboard alerts when vials are expiring or running low
- Compound reference pages: all QSC catalog peptides (~20–30) with dosing ranges, citations, and stacking notes
- Automated Telegram ordering: order builder + MTProto bot-dispatched Telegram message to vendor + manual fallback
- **Inventory-aware order builder**: suggests compounds running low when building an order
- Order history + inventory capture: order logged, inventory updated post-delivery
- Multi-user admin panel: Power User can create/configure managed user accounts
- Auth: email/password accounts, sessions, password reset
- **PWA / home screen install**: web app installable to phone home screen; service worker for offline dose-log queuing
- **First-run setup wizard**: 3-step onboarding on first login (browse compound → create protocol → optional Telegram setup)

### Should Have — missing degrades experience but doesn't block launch
- Injection site rotation tracking with site suggestion
- Cycle management (start/end dates, current week display, scheduled breaks)
- **Protocol pause / resume**: pause individual protocols without deleting them
- Subjective outcome logging (daily rating + free-text note)
- Vial inventory tracking (per-vial reconstitution record, doses-remaining estimate)
- Stack overview dashboard (all active protocols, today's status)
- Coinbase payment checklist (payment amount + address capture, guided payment steps)
- Peptide search/browse (by name and category)
- **Dose reminders**: browser push or email notification at user-configured dose time
- **Outcome-dose correlation timeline**: per-compound chart of dose events vs. outcome ratings
- **CSV export**: dose logs and orders as CSV alongside JSON full export
- **Stacking notes on compound profiles**: admin-curated "commonly stacked with" field

### Could Have — include if time permits
- Protocol history (full audit log of every dose)
- Vendor price catalog import from PDF
- Admin panel and Power User workflow mobile polish (dose-logging mobile UX = Must Have per §8.6; this entry covers remaining layout optimization)
- Dark mode

### Won't Have — this release
All items in the Out of Scope list (§3.2).

> **Phase vs. MoSCoW alignment:** MoSCoW defines what must be complete before "v1 done" is declared. Phases (§10) define build order — Must Have features are delivered across Phase 1 and Phase 2 in sequence, not all on day one. If a Must Have feature appears in Phase 2, it is scheduled for Phase 2 delivery but still blocks v1 completion. "Mobile-optimized layout" in Could Have refers to admin panel and Power User workflow refinement; mobile dose-logging UX is first-class per §8.6 and is a Must Have acceptance criterion, not optional polish.

---

## 5. Feature Specifications

### 5.1 Pillar 1 — Reference

**What it does:**
Provides honest, citation-backed compound profiles for each peptide in the catalog — written for a user planning to inject this compound, not a researcher. No "research use only" boilerplate.

**Compound profile fields:**
- Common name + IUPAC name
- Mechanism of action (evidence-based, plain language + optional technical depth toggle)
- Researched benefits (each benefit links to primary PubMed citation where available)
- Dosing ranges: low / typical / high dose; protocol context (healing vs. performance vs. cosmetic)
- Administration route(s): subcutaneous, intramuscular, intranasal, oral
- Reconstitution guidance: recommended BAC water dilution, shelf life reconstituted
- Half-life and timing notes (e.g., "best taken fasted," "AM vs. PM relevance")
- Known side effects and contraindications (labeled as anecdotal when evidence is weak)
- Research citations (PubMed links; DOI where available)
- Sourcing note: "Available from [vendor] as [form/size]" — honest, no compliance theater
- Stacking notes: admin-curated 1-2 sentence "Commonly stacked with" field (e.g., "BPC-157 is often stacked with TB-500 for synergistic soft tissue repair"). Optional; shown when present. No AI generation — curated by Power User.

**Out of scope for this feature:**
- Community-contributed profile edits
- AI-generated profiles without human review (AI may draft; Power User must review and approve)
- Drug interaction checker (v2 after Peptify-style pharmacokinetic modeling is evaluated)
- Dose recommendation ("take X mcg" framing — avoided per anti-vision; ranges only)

**v1 catalog scope:**
~20–30 compounds seeded from QSC vendor PDF. Every compound the user might order from QSC should have a profile before v1 ships.

**Search & browse:**
- Text search by common name (e.g., "BPC", "TB-500", "sema")
- Browse by category: healing/recovery, GH secretagogues, GLP-1/metabolic, nootropics/cognitive, cosmetic/skin, other
- Sort: alphabetical, most common (manually curated rank), recently viewed

**Error scenarios:**
- Compound is in QSC catalog but profile is not yet complete → show "Profile in progress" placeholder with compound name and basic sourcing info; not a 404
- Search returns 0 results → "Not yet in catalog — check back or submit a request" (v2: request form)
- Compound is deleted from the vendor catalog but is referenced by an existing protocol or dose log → compound record is soft-deleted (never hard-deleted); UI shows the compound name as "[Name] (archived)" with no active profile link; FK integrity preserved across all historical records

---

### 5.2 Pillar 2 — Protocol Tracker

**What it does:**
Manages multi-compound stacks for the Power User and their managed users. Replaces a spreadsheet-and-memory system with a structured schedule supporting daily logging, injection site tracking, cycle management, and subjective outcome recording.

#### 5.2.1 Protocol Definition

**Protocol fields:**
- Compound (linked to reference catalog; required)
- Dose amount (numeric; unit: mcg / mg / IU / mL)
- Dose frequency: daily / every other day (EOD) / specific days of week / custom interval (days)
- Administration route (defaults from compound profile; overridable)
- Start date (required)
- Optional end date
- Cycle association (optional link to a cycle record)
- Free-text notes field

**Protocol status lifecycle:** active | paused | completed | deactivated
- **Pause / Resume:** "Pause" sets status to paused; paused protocols are excluded from "today's doses" but visible in protocol list with status indicator. "Resume" restores active status. Dose history is unaffected by pause/resume.
- **Deactivated:** terminal soft-delete state. Deactivated protocols are immediately excluded from "today's doses" (effective at the moment of deactivation, including for doses already due today but not yet logged). They remain visible in the protocol list under an "Inactive" filter with full dose history preserved. They cannot be resumed — to resume an deactivated protocol, the user clones it (see below). Dose history attached to a deactivated protocol is never deleted; only account deletion removes it.
- **Clone:** "Clone this protocol" creates a copy with all fields copied (compound, dose, frequency, route, notes). User sets a new start date. The clone starts in draft state and is not active until the start date is confirmed.
- **Restart cycle:** "Restart cycle" reopens a completed cycle with a new start date, re-linking all its associated protocols as new clones. The original completed cycle is preserved in history.
- **Admin-initiated deactivation of a managed user's protocol:** when a super admin deactivates a managed user's protocol mid-day, the managed user's dashboard refreshes on next render (or polling tick) to remove the affected dose from "today's doses." Any dose for that protocol already logged earlier in the day is preserved. If the managed user is mid-log when the deactivation lands, the log submission is accepted (last-writer-wins on the in-flight request) and the protocol's history retains that final log entry.

**Out of scope:** AI-suggested protocols, community protocol templates

**Error scenarios:**
- Protocol saved with no compound → blocked: "Compound required"
- Protocol dose of 0 → blocked: "Dose amount must be greater than zero"
- Protocol start date in the past → allowed; no back-fill of historical dose logs
- Clone of a paused or deactivated protocol → allowed; clone starts as active (with user-set start date)

#### 5.2.2 Daily Dose Logging

**Logging flow (individual):**
1. Dashboard shows "Today's doses" — list of all active protocol doses due today for the logged-in user
2. User taps a dose entry → sees dose details (compound, scheduled amount, suggested injection site)
3. User confirms dose or edits the actual amount taken if it differed from scheduled
4. Optional: add a note (free text, max 500 chars)
5. Log entry saved with timestamp; dashboard updates to mark dose as logged

**Batch logging flow ("Log All Scheduled" — Must Have):**
1. "Log All Scheduled" button appears at top of today's doses when ≥ 1 dose is pending
2. User taps → review screen shows all pending doses pre-filled at protocol amounts with suggested injection sites
3. Any dose with a vial expiry warning is flagged in the review list (not blocked)
4. User taps "Confirm all" → all doses logged simultaneously with current timestamp
5. User can remove individual doses from the batch before confirming (e.g., skip one compound)
6. Success: dashboard clears all logged doses; total time target ≤ 3 taps

**Log record fields:**
- Protocol reference (FK)
- Actual dose taken (may differ from scheduled amount)
- Timestamp (auto-captured; editable within same calendar day only)
- Injection site used
- Note (optional)
- Logged by (user ID — relevant for admin visibility)

**Error scenarios:**
- User attempts to log a dose when vial inventory shows 0 remaining → warning ("No active vial recorded for this compound — log anyway?"); does not block, but flags prominently
- Duplicate log for same protocol + same day → "You already logged this today. Log again?" — requires confirmation
- Missed dose (calendar day passes with no log) → no automatic fill or penalty; appears as "Not logged" in history; retroactive logging not supported after the calendar day ends (audit integrity)
- Dose skip (user intentionally skips) → user can tap "Skip" on a dose entry; recorded as a skip event; counts as 0 in adherence metrics; distinguishable from "Not logged" in history
- Late dose (logged same calendar day but past typical window) → accepted; no time-window enforcement; timestamp is as logged
- Timezone / DST shift → all timestamps stored in UTC; dashboard "today's doses" resolves based on user's browser local date

#### 5.2.3 Injection Site Rotation

**Rotation system:**
- Selectable sites: left abdomen, right abdomen, left thigh, right thigh, left deltoid, right deltoid, ventrogluteal L, ventrogluteal R
- Per-compound site history (peptides with route requirements respect the correct site group)
- On each dose log entry, app suggests the next site in rotation based on history (round-robin)
- User can override the suggestion before confirming
- Visual history: last 7 injections per compound, shown as site name list

**Out of scope:** Body-map visualization (could have, not must have); AI-optimized rotation; custom site definitions

**Error scenarios:**
- No prior injection history for this compound → no suggestion shown; first site is user's choice with all options available

#### 5.2.4 Cycle Management

**Cycle fields:**
- Cycle name (e.g., "BPC-157 healing cycle Q1 2026")
- Start date and optional end date (or "ongoing")
- Associated protocols (multiple protocols can be linked to one cycle)
- Scheduled breaks (optional: define off weeks by date range)
- Status: active / paused / completed

**Dashboard shows:**
- Current cycle week for each active cycle (e.g., "Week 3 of BPC-157 healing cycle")
- Break indicator when in a scheduled break period

**Out of scope:** Automated reminders on break/restart, AI-suggested cycle lengths

**Error scenarios:**
- Cycle with overlapping date ranges on the same compound → warning shown, not blocked

#### 5.2.5 Subjective Outcome Logging

**Daily log entry:**
- Overall wellbeing rating (1–5)
- Optional per-protocol rating (1–5 per active compound)
- Free-text note (max 1,000 chars)
- Optional tag multi-select: energy, sleep, mood, pain, recovery, libido, cognition (extensible list)

**Display:**
- Timeline view: last 14 days of ratings + notes
- No analytics charts required in Must Have; simple sparkline for Could Have

**Out of scope:** Quantitative biomarker logging (deferred to lab import feature, v2), machine learning on outcome data, AI pattern recognition

#### 5.2.6 Stack Overview Dashboard

**Dashboard surfaces:**
- All active protocols for current user: compound name, today's dose status (logged / pending), scheduled dose amount
- Current cycle week for each linked cycle
- Vial inventory indicator per compound (doses remaining — estimate based on logged doses vs. vial size)
  - "Expiring in N days" badge when a vial is within 7 days of estimated expiry
  - "Running low" badge when estimated doses remaining < 5
  - "EXPIRED" badge with days-since-reconstitution when vial is past expiry date
- Last 7-day subjective rating average
- "Log All Scheduled" batch action at top of today's doses list
- Quick-log action on each dose entry (one tap to confirm scheduled dose)

#### 5.2.7 Dose Reminders (Should Have)

**What it does:**
Notifies the user (or managed user) at a configured time to open the app and log their doses. Addresses the retention risk that users forget to open the app, which makes adherence tracking worthless.

**Reminder configuration:**
- User sets a single daily reminder time per account (e.g., 7:00am)
- Reminder is global (covers all active protocols); per-protocol reminder time = out of scope for v1
- Managed users configure their own reminder time (or Power User can set it during protocol setup)

**Delivery channels (in priority order):**
1. **Browser push notification** — available if the user has installed the PWA and granted notification permission; delivered via Web Push API at the configured time
2. **Email reminder** — fallback if push is not available or not granted; uses the existing transactional email provider (§7.1); email subject: "Your [N] doses are due today" with a deep-link back to the app

**Out of scope:** SMS reminders, per-dose reminders at different times, reminder snooze, reminder history

**Error scenarios:**
- Push permission denied → app shows banner "Enable notifications for dose reminders" with link to browser settings; falls back to email
- Email delivery failure → logged; no retry loop; silent (not a user-facing error)

---

#### 5.2.8 Outcome-Dose Correlation Timeline (Should Have)

**What it does:**
Shows dose events and subjective outcome ratings together on a single timeline per compound (or cycle). The data-motivated reason to use the tracker beyond logistics — lets the user see patterns between dosing and how they feel.

**View spec:**
- Accessible from: compound profile page ("My data" tab) and cycle detail view
- Date range: 30 days (default) or 90 days (toggle)
- Chart layout (dual-axis):
  - x-axis: date
  - y1 (bars or dots): dose logged on that day (yes/no, or actual dose vs. protocol dose)
  - y2 (line): daily overall outcome rating (1–5; missing = no rating that day)
- Summary stats below chart: "Average outcome rating on days dosed: X.X | On days not dosed: X.X" (descriptive stats only; no AI or ML)
- No data state: "Log at least 7 doses and 7 outcome ratings to see your correlation timeline"

**Out of scope:** Multi-compound overlay chart, regression analysis, AI-generated insights, predictive modeling

---

### 5.3 Pillar 3 — Reconstitution Calculator

**What it does:**
Calculates BAC water volume, resulting concentration, and syringe unit marks for a given dose. Connected to vial inventory and dose history. Safety-critical: zero dose-calculation defects allowed.

**Calculator inputs:**
- Compound (pre-filled from active protocol or manually selected from catalog)
- Vial size in mg (numeric — e.g., 5 mg)
- BAC water volume to add in mL (user adjusts; default suggested based on common dilutions for that compound)
- Target dose in mcg or mg (pre-filled from protocol; user can override)

**Calculator outputs (all shown simultaneously):**
- Resulting concentration: mg/mL and mcg/mL
- **Units on 100-unit insulin syringe for the target dose** (large, prominent display — this is the key output)
- Cross-check: units for the "low," "typical," and "high" doses from the reference profile (so user can verify their dose makes sense)

**Reconstitution event recording:**
- After confirming calculation, user clicks "Record reconstitution" → creates a vial record
- Vial record: compound, vial size, BAC water volume added, final concentration, date reconstituted, estimated shelf-life expiry (14 days refrigerated default; configurable)
- Vial record links to subsequent dose logs to decrement doses-remaining estimate

**Dose-history integration:**
- Shows the last logged dose for this compound: "You logged X mcg yesterday at HH:MM" (safety context)
- Shows current protocol dose for comparison

**Safety guardrails (non-negotiable):**
- Zero dose-calculation defects: all math must be covered by unit tests with known reference values
- If calculated dose-per-unit exceeds the reference profile's "high" dose → yellow warning: "This calculation is above the typical high dose range. Double-check your values."
- If resulting volume per dose exceeds 1.5mL → warning: "Large injection volume — verify this is correct"
- If BAC water volume < 0.5mL → warning: "Low reconstitution volume may make accurate dosing difficult"

**Out of scope:**
- Pharmacokinetic modeling or half-life decay curves
- Multi-vial pooling math
- Dosing suggestions ("you should take X")

**Error scenarios:**
- BAC water volume = 0 → blocked: "BAC water volume required to calculate concentration"
- Vial size = 0 → blocked
- Target dose numerically exceeds total vial content → warning: "This dose would require more than one vial's worth of compound"
- Negative values in any field → blocked with field-level error

---

### 5.4 Pillar 4 — Ordering (Telegram + Crypto)

**What it does:**
Enables the Power User to place a vendor order via Telegram with the app sending the order message automatically via MTProto (user's own Telegram account). The user then handles crypto payment manually through Coinbase.

**⚠ v1 architecture decision — supersedes vision guidance:**
The vision document recommended "guided manual v1" (app composes message; user pastes to Telegram). The user has confirmed v1 = full Telegram automation (MTProto sends the message without opening Telegram). This decision elevates Telegram session fragility from a v2 risk to a v1 Must Have risk. As a result, a graceful manual fallback mode (message is copyable; Telegram deep-link is always visible) is **required** in every ordering flow, not optional.

**External actor — QSC vendor:** The vendor is a key external participant in the ordering flow. v1 assumes QSC's Telegram-first ordering pattern: user sends an item list message → vendor replies with confirmed price and wallet address. Vendor reply format is unstructured; v1 processes vendor replies manually. The v2 AI response parser adds automated reply extraction.

**MTProto feasibility gate:** Before Phase 1 ships, validate in the target runtime: (a) MTProto auth code flow completes successfully, (b) session storage and retrieval is reliable across restarts, (c) message send to a real vendor chat succeeds. If a blocker is found, fall back to "compose only" scope reduction — app writes the message, user copies it to Telegram — without shipping Phase 1 incomplete.

#### 5.4.1 Telegram Account Authentication (one-time setup)

**Setup flow:**
1. User enters their Telegram phone number
2. Telegram sends a verification code via standard MTProto auth
3. User enters code in app
4. App stores encrypted MTProto session (server-side, AES-256 at rest, user-scoped)
5. User selects or enters the vendor's Telegram username / chat ID
6. App sends a test "ping" message (or skips — user discretion) to confirm connection

**Vendor configuration per vendor:**
- Vendor display name
- Telegram username or chat ID
- Order message template (plain text with item/quantity placeholders; default provided)
- Preferred currency (USDT, BTC, ETH, etc.)

**Fallback always visible:**
- Composed order message is always shown as copyable text in the UI
- "Open in Telegram" deep-link button (tg://resolve?domain=VENDOR&text=MESSAGE) always present
- User can always choose to send manually even when automation is configured

**Out of scope:** Official Telegram Bot API (bots can't initiate messages to arbitrary users); OAuth (no standard OAuth for Telegram user accounts)

**Error scenarios:**
- Auth code expired → re-request code flow with timer
- Session invalidated by Telegram (device limit) → force re-auth with clear explanation: "Your Telegram session was invalidated. Re-authenticate to resume ordering."
- Vendor username not found → inline error + show manual fallback immediately

#### 5.4.2 Vendor Catalog

**Catalog fields per compound entry:**
- Compound name (linked to reference catalog)
- Available forms (lyophilized powder, solution)
- Vial size options (2mg, 5mg, 10mg, etc.)
- Price per unit (USD or vendor currency; manual entry)
- In-stock flag (manual toggle; no live sync in v1)
- Minimum order quantity

**v1 import:**
Data entered manually by Power User from QSC PDF. Prices updated manually when vendor price list changes (PDF import parser is a Could Have).

**Out of scope:** Live API price sync, multi-vendor price comparison, automated price-change alerts

#### 5.4.2b Inventory-Aware Order Suggestions (Must Have)

When the user opens the order builder, the app calculates days-to-depletion for each active protocol's compound and surfaces a "Suggested order" section at the top of the order builder.

**Suggestion logic:**
- For each active protocol: estimated daily dose rate × doses remaining in active vial = days until depletion
- If days until depletion < 14: show compound in suggested list with: compound name, vial form + size currently used, days remaining, suggested reorder quantity (default: 2 vials)
- Compounds with no active vial record but active protocol → also surfaced: "No active vial recorded"

**Suggested order UI:**
- Shown as a collapsible section "Based on your inventory" above the full vendor catalog
- Each suggested item has: compound name, reason ("~8 doses remaining"), pre-filled quantity (editable), "Add to cart" button
- Dismissible per session if user prefers to browse manually

**Out of scope:** ML-based quantity optimization, multi-cycle lookahead beyond 14 days

#### 5.4.3 Order Builder

**Order flow:**
1. Browse or search vendor catalog
2. Add items to cart (compound, form, vial size, quantity)
3. Review cart: itemized list with per-item price, subtotal
4. App composes the Telegram order message using vendor's template (e.g., "Hi, I'd like to order: 10x BPC-157 5mg, 5x TB-500 5mg. Please confirm price and wallet address. Thank you.")
5. User reviews composed message (editable before send)
6. User clicks "Send Order" → app sends message via Telegram MTProto to vendor chat
7. App records the order with status: "Sent — awaiting confirmation" and timestamps the event

**Order record fields (created at send):**
- Order ID, created timestamp
- Vendor reference
- Line items: compound, form, vial size, quantity, unit price
- Telegram message text (as sent)
- Order status (see state machine in §5.4.4)
- `send_method`: `"automated"` (MTProto send succeeded) | `"manual_fallback"` (user used copy/deep-link)
- Payment fields (populated in §5.4.4): confirmed total, currency, wallet address, tx ID (optional)

**Duplicate item in cart:** If the same compound + form + vial size is added more than once, quantities are merged into one line item. Different vial sizes of the same compound are separate line items.

**Fallback mode (always available, even when bot is working):**
- Composed message visible as copyable text below the send button
- "Open in Telegram" deep-link button visible at all times
- If MTProto send fails for any reason → show error, automatically surface fallback mode, do NOT silently discard the order

**Out of scope:** Discount codes or promo fields, multi-vendor split orders

**Error scenarios:**
- Telegram send fails (network, session expired, rate limit) → show error message + fallback mode immediately; order remains in "draft" state
- Cart is empty → send button disabled; "Add items to your order first"
- Item in cart has no price set → soft warning: "Price not set for [item]. Order will be sent without a price confirmation."

#### 5.4.4 Order Tracking & Payment

**Post-send flow:**
1. App shows "Order sent — waiting for vendor confirmation" with Telegram deep-link to vendor chat
2. User reads vendor's Telegram reply manually (v1; AI response parser is v2)
3. User manually enters in app: confirmed order total, crypto currency, wallet address from vendor's message
4. App shows payment confirmation step: total, currency, wallet address — all visible together on one screen
5. **User must acknowledge the wallet address + amount display before proceeding** (safety gate)
6. User sends crypto payment from Coinbase or other wallet manually (app does not execute payment)
7. User optionally enters transaction ID in app (for audit record)
8. User clicks "Mark payment sent" → order status: "Payment sent — awaiting shipment"
9. User receives shipment; clicks "Mark received" → triggers inventory update prompt
10. App prompts: "Add these items to your inventory?" with each ordered compound and quantity pre-filled

**Payment safety guardrail:**
The wallet address and payment amount must be visible on screen at the moment the user clicks "Mark payment sent." This step cannot be bypassed. If no wallet address has been entered, the "Mark payment sent" button is greyed with tooltip: "Enter vendor's wallet address first."

**Inventory update on delivery:**
- "Mark received" creates a vial record in Pillar 3 for each ordered compound
- Record: compound, quantity, order reference, date received
- User can add reconstitution details on first use (links to Pillar 3 calculator)

**Order status state machine:**
```
Draft → Sent → Confirmed → Payment Sent → Received  (terminal)
                         → Cancelled                 (terminal)
       → Stale (auto-flagged after 14 days in "Sent" with no update)
```
- **Cancel order:** Power User can cancel any order in Draft, Sent, Confirmed, or Stale status from Order History. Cancelled orders remain in history with status and timestamp.
- **Stale detection:** If an order remains in "Sent" status for 14 days without a manual status update, it is auto-flagged "Stale — check Telegram." A banner prompts the user to check their Telegram chat and either update the status or cancel the order.
- Status transitions are forward-only except Cancel, which can be applied from any non-terminal status.

**Out of scope:** Automated crypto sending, Coinbase API wallet integration (no custodial access), automated vendor reply parsing (v2)

**Error scenarios:**
- User clicks "Mark payment sent" with no wallet address recorded → blocked with clear error
- User clicks "Mark received" before order status is "Payment sent" → warning shown ("Payment hasn't been marked as sent. Mark received anyway?") with confirmation
- Order sent but user closes browser → order persists in "Sent" status; accessible from Order History on next login
- Duplicate send attempt (double-click or network retry) → idempotency check: if an identical message was sent to the same vendor within the last 60 seconds, show "Possible duplicate — send again?" before proceeding
- Vendor changes quoted price after order sent → user enters the new total at payment confirmation time; no lock on the amount at "order sent" time; previous vendor replies are visible in Telegram for reference
- Stale wallet address → user is shown the wallet address from their most recent order to the same vendor for comparison, but must verify the current address from the vendor's Telegram reply before marking payment sent

---

### 5.5 Multi-User & Admin

**What it does:**
Allows the Power User (super admin) to create and manage family/friend accounts, configure their protocols, monitor their adherence, and control their access.

**Super admin capabilities:**
- Create managed user accounts: name + email; app sends an invite email with a one-time setup link (expires after 72 hours)
- Configure protocols for any managed user (using the same protocol editor as their own)
- View any managed user's dose log and 7/30-day adherence metrics
- Edit or deactivate managed user protocols
- Reset a managed user's password (sends a reset email to the managed user)
- Deactivate a managed user account (their data is retained; access is revoked)
- Delete a managed user account (with user's data export generated first)

**Managed user capabilities:**
- Log their own doses from their configured protocols
- View their own schedule and dose history
- Look up compound reference pages
- View the reconstitution calculator (read-only if their protocol has a linked vial record)
- Change their own password

**Managed user cannot:**
- Create or edit protocols (read-only view of their own)
- Access the ordering module or vendor catalog
- See any other user's data
- Access the admin panel
- Create additional user accounts

**Invite link lifecycle:**
- Invite link expires 72 hours after issuance
- Admin panel shows invite status per user row: **Active** | **Invited (expires MM/DD)** | **Invite Expired** | **Deactivated**
- Admin can resend invite from the user row; resend generates a new link and invalidates the old one
- Accepting an expired invite: "This invite link has expired. Contact your administrator for a new link."
- Resend to a user who already accepted: not available (account already active); admin uses password reset instead

**Admin panel views:**
- List of all managed users: name, email, last login, invite status, 7-day adherence % (doses logged ÷ doses scheduled)
- Click-through to any managed user's dose history and active protocols
- No logging-on-behalf-of (audit integrity: logs are always attributed to the user who confirmed)

**Out of scope:**
- Role hierarchy beyond (super admin + managed user)
- Multiple admins / co-admin role
- Managed users creating their own accounts (Power User invitation flow only in v1)
- Managed users viewing each other's data

**Error scenarios:**
- Admin invites an email already registered → "This email already has an account"
- Admin invites the same email twice (pending invite exists) → "An invite is already pending for this email. Resend or cancel it first."
- Admin tries to delete their own super admin account while managed users are active → blocked: "You have N active managed users. Deactivate or transfer them before deleting your account."
- Managed user navigates to `/ordering` → 403 with message: "Ordering is managed by your administrator"
- Deactivating a managed user with active protocols: protocols are not auto-deleted; admin sees a warning "This user has N active protocols. Deactivating their account will prevent them from logging doses. Continue?"

---

### 5.6 Auth & Account Management

**Authentication:**
- Email + password (bcrypt, min cost 12)
- Sessions: httpOnly JWT or server-side session cookie; 30-day rolling expiry
- Password requirements: minimum 12 characters; no maximum; no complexity rules (length alone is the security factor)
- Password reset: email link, expires in 1 hour, single-use

**Account actions:**
- Change email: requires current password confirmation; sends verification to new email before applying
- Change password: requires current password confirmation
- Delete account: generates and delivers a full data export (JSON), then permanently deletes the account and all associated records after 48-hour delay (or immediate with double-confirmation modal)

**First-Run Setup Wizard (Must Have):**
Triggered on first login after account creation (or invite acceptance for managed users). A 3-step guided flow to reach first-value quickly.

| Step | Power User | Delegated Participant |
|------|------------|----------------------|
| 1 | "Browse your first compound" → reference catalog with "Start protocol" shortcut | "Here's your schedule" → shows protocols configured by admin (read-only) |
| 2 | "Create your first protocol" → protocol editor pre-filled with compound from step 1 | "How to log a dose" → interactive walkthrough of dose logging |
| 3 | "Set up ordering (optional)" → links to Telegram auth setup | Done |

- Wizard is dismissible at any step ("Skip setup, I'll explore on my own")
- A "Getting Started" checklist on the dashboard (3 items for Power User: add compound, create protocol, log first dose) persists until all 3 are complete or the user dismisses it
- Does not reshow after dismissed or completed

**Out of scope (v1):**
- Social login (Google, Apple)
- MFA / TOTP (Could Have; not Must Have)
- SSO or organizational login

**Error scenarios:**
- Login with wrong password → "Invalid email or password" (do not specify which field is wrong)
- Password reset request for unknown email → show success message ("If that email exists, a reset link was sent") — do not leak email existence
- Super admin account deletion while managed users are active → blocked (see §5.5 error scenarios)

---

### 5.7 Data Export & Privacy Controls

**Export:**
- User can request a full export of their data at any time from account settings
- **Full export (JSON):** protocols, dose logs, vial inventory, order history, outcome logs — complete data portability
- **CSV export (Should Have):** dose logs and orders available as CSV download (dose_logs.csv, orders.csv) alongside the JSON export. Columns match data model fields. Useful for analysis in Excel / Google Sheets.
- For exports < 10MB: download immediately
- For exports ≥ 10MB: generated asynchronously; download link emailed within 5 minutes

**Deletion:**
- Account deletion deletes all user data: protocols, dose logs, order history, vial records, outcome logs
- Deletion is irreversible; user sees explicit warning; 48-hour delay before execution (or immediate with confirmed double-acknowledgment)
- All associated managed user accounts must be deactivated before super admin account can be deleted

**Data retention policy:**

| Data type | Retention | Notes |
|-----------|-----------|-------|
| Dose logs | Until account deletion | No automatic archival or expiry |
| Protocol history | Until account deletion | |
| Order history | Until account deletion | |
| Vial records | Until account deletion | |
| Outcome logs | Until account deletion | |
| Audit log | 90 days rolling | Scoped to user; accessible to super admin only |
| DB backups | 30 days rolling | See §8.4 |
| Telegram MTProto session | Revoked on account deletion or on user request | Not included in data export |

All user-created data is retained until explicit account deletion. No automatic purge, expiry, or archival of any tracker, ordering, or protocol data.

**Privacy commitments (from vision Principle 4):**
- No protocol or dose data used for analytics, product decisions, or model training
- No third-party data sharing
- No engagement or behavioral tracking
- Audit log of protocol changes: retained 90 days, scoped to the user, accessible to super admin only

---

## 6. Success Criteria

### Hard Gates — all releases, no exceptions

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Dose-calculation defects | Zero known defects | Unit tests for all reconstitution calculations with reference values; no regressions in CI |
| Payment confirmation flow | 100% of crypto payments require explicit wallet address + amount display before "payment sent" can be marked | Manual QA + E2E test |
| Silent failures | Zero — every order, dose, and vial event has a visible error state and recovery path | E2E test suite covering failure paths |
| Audit log completeness | 100% of protocol mutations, dose logs, and order events are recorded | DB-level assertion in integration tests |

### Phase 1 — Personal Tool (months 1–3)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Power User daily active use | Logs doses every day for 14 consecutive days | Auth log + dose log timestamps |
| Spreadsheet decommissioned | Obsidian/spreadsheet abandoned for peptide tracking within 90 days | Self-reported |
| First order via app | ≥ 1 successful Telegram order sent via MTProto with no manual Telegram intervention | Order history in app |
| Protocol setup speed | New 3-compound protocol created in < 5 minutes | Manual timed test |
| Reconstitution calc accuracy | Syringe-unit output matches manual calculation for all test cases | Unit test suite |

### Phase 2 — Family Adoption (months 3–6)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Managed user count | 3–10 Delegated Participants with ≥ 1 active protocol each | Admin panel |
| Delegated Participant retention | ≥ 70% of managed users log doses ≥ 5 days/week for 30 days | Dose log frequency |
| Power User support burden | Delegated Participants text the Power User < 5 times about app usage in first 30 days | Self-reported |
| Ordering reliability | First 20 successful Telegram orders via app (cumulative through month 6); < 3 with `send_method = "manual_fallback"` | `orders` table: `status = "Received"` count; `send_method` field |

### Year 1 Cumulative

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Ordering loop | ≥ 20 successful orders cumulative (same target as Phase 2 reliability milestone; Year 1 confirms continued use beyond the milestone) | Order history |
| Reference coverage | 30–50 peptide profiles with primary citations and dosing ranges | Catalog count |
| Personal adoption | Power User uses the app daily; spreadsheet decommissioned | Self-reported |

### Year 3 Aspirational

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Active users | 100–1,000 | Auth logs |
| Community reputation | Referenced as "the honest peptide app" in r/Peptides or biohacker forums | **Monitoring protocol:** Power User (or a delegate) performs a quarterly search on r/Peptides, r/Biohackers, r/longevity, and 2-3 biohacker Discord servers for: (a) direct product mentions by name, (b) mentions of the differentiating positioning ("the honest peptide app," "the grey-market peptide app," etc.), (c) recommendations to other users. **Counts as a reference:** an unsolicited mention by a non-Power-User-affiliated user (not a paid mention, not seeded by the Power User). **Target:** ≥ 5 unsolicited references per quarter by end of Year 3. Maintain a running log at `docs/community-references.md`. |
| Sustainability | Hosting + maintenance costs covered by license revenue (legal review gate passed) | Revenue vs. cost |

---

## 7. Constraints

### 7.1 Technical
- **Platform:** Web app only. No App Store distribution (iOS and Android App Stores would reject this product by policy).
- **Telegram integration:** Requires an MTProto client library for user-level Telegram access. Not the official Telegram Bot API (bots cannot initiate messages to arbitrary users). Specific library selection is deferred to the tech-stack step. User session stored AES-256 encrypted server-side.
- **Telegram rate limits:** MTProto flood-wait limits apply to auth code requests, session verification, and message sending. At expected v1 usage (5–15 order messages/month, 1 auth event per device setup), limits are not a v1 risk. For v2 AI response parser that polls message history: flood-wait signals must be respected; polling must implement exponential backoff.
- **Database:** Relational (PostgreSQL preferred). No local-first / SQLite-only architecture. Privacy commitment is at the application layer, not the storage layer.
- **Deployment:** Cloud or VPS; must support < $100/month at initial user counts (1–50 users).
- **Crypto payments:** Manual. No custodial wallet. No automated transaction execution. User pays from their own Coinbase. App tracks payment metadata only.
- **No App Store:** Web/PWA is the only distribution channel. PWA manifest + service worker required for home screen install and offline dose-log queuing (see §8.6).
- **Transactional email:** Required for invite links, password reset, and async export delivery (§5.5, §5.6, §5.7). Provider selection is a tech-stack decision (budget line item in §7.3). Deliverability is a constraint — transactional email must reach consumer inboxes reliably (not bulk/marketing sender reputation).
- **PubMed citations:** v1 reference profiles link to PubMed externally (static DOI/PMID URLs; no programmatic API access). PubMed API integration is deferred to v2 (Automated PubMed Watch feature).

### 7.2 Timeline
- No hard external deadline. Personal-tool-first sequencing.
- **Milestone 1 (M1):** Dose logging + reconstitution calculator → Power User decommissions spreadsheet
- **Milestone 2 (M2):** Telegram ordering → first order placed via app
- **Milestone 3 (M3):** Multi-user → first Delegated Participant active
- Milestones are personal gates, not public dates. Sequence matters; duration is flexible.

### 7.3 Budget
- **Development:** Solo developer. No contractor budget. Time cost only.
- **Infrastructure target:** < $100/month at 1–50 users; < $500/month at 51–500 users.
- **Third-party services:** PostgreSQL hosting, transactional email (Resend or Postmark), object storage for exports — commodity services only.
- **Telegram MTProto:** Free (no API usage cost).
- **No revenue in v1.** Family and friends use for free. Legal review required before any paid license consideration.

### 7.4 Team
- Solo developer (the Power User is also the builder).
- Assumed full-stack web capability. Technology framework deferred to tech-stack step.
- No design team: UI is functional-first; use a component library to compensate.
- No QA team: automated test coverage is non-negotiable to compensate. Critical paths (reconstitution math, payment confirmation flow) require 100% unit test coverage.

### 7.5 Regulatory & Legal
- **Legal review trigger:** Required before charging any money for a license. Family/friend use is free until legal review is complete and cleared.
- **Product framing:** Honestly described as a peptide tracker and reference web app. Ordering = opt-in advanced module. No misrepresentation to payment processors.
- **Data privacy:** Not a HIPAA-covered entity (no PHI in the legal sense). GDPR not applicable for v1 (US personal tool). Re-evaluate at public launch, especially if European users are targeted.
- **Phase 2 legal gate:** Before Phase 2 ships (managed users), the Power User conducts a structured self-review against this checklist (consultation with a privacy-experienced attorney is optional but recommended if any item is uncertain). **Pass criteria — all six items must be satisfied before Phase 2 ships:**
  1. Each managed user signs (or clicks-through) a written acknowledgment that the Power User is configuring their protocols and can view their adherence data.
  2. No managed user is a minor; no managed user lacks legal capacity to consent.
  3. The data-export and account-deletion flows in §5.6 + §5.7 are verified working end-to-end for managed users (a managed user can request their data and have their account deleted by the Power User on demand).
  4. The audit log (§5.7) records every admin action taken on a managed user's data, with the actor identity preserved.
  5. The product framing in marketing or recruitment communications to family/friends is honest (no claim of clinical oversight, professional advice, or HIPAA coverage).
  6. The Power User has reviewed their state-of-residence law for any provisions that materially apply to storing third-party health-adjacent data outside a clinical relationship.

  If any item fails, Phase 2 does not ship until it is remediated. This is not a HIPAA obligation for personal use, but managing other people's health-adjacent data creates stewardship responsibility.
- **Harm reduction:** All dosing content cites ranges; the product does not tell users what to take or prescribe protocols. Side effects and contraindications are documented.
- **Sourcing as removable module:** Architecture keeps the ordering module isolatable. If regulatory landscape requires it, sourcing can be disabled without breaking the reference and tracker pillars.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Requirement | Target | Measurement method | Fail threshold |
|-------------|--------|-------------------|----------------|
| Page load (FCP) | < 2.5s on broadband | Lighthouse CI in PR | > 3.0s blocks deploy |
| API read response | p95 < 200ms | k6 load test in CI | > 300ms triggers investigation |
| API write response | p95 < 500ms | k6 load test in CI | > 800ms triggers investigation |
| Dose log submit (end-to-end) | < 500ms | E2E test timing | > 1s degrades AM routine |
| Reconstitution calc | < 100ms client-side | Jest benchmark | > 500ms for any path |
| Telegram order send | < 5s from click to delivery | E2E with test Telegram account | > 10s: show progress indicator; > 30s: timeout + fallback |

### 8.2 Security

| Requirement | Target | Verification |
|-------------|--------|-------------|
| Password storage | bcrypt, cost factor ≥ 12 | Code review |
| Session tokens | httpOnly cookie; SameSite=Strict; 30-day rolling expiry | Code review |
| Telegram session storage | AES-256 encrypted at rest; never returned via API; user-scoped | Code review + integration test |
| Transport | TLS 1.2+; HSTS header; no mixed content | SSL Labs ≥ A grade |
| SQL injection | Parameterized queries only; ORM or query builder; no raw string concatenation | Code review + static analysis |
| XSS | CSP headers; framework auto-escaping; no `dangerouslySetInnerHTML` | Automated scan (Snyk or equivalent) |
| IDOR | All data-access queries include user_id scoping; no sequential ID enumeration in public-facing routes | Integration test suite |
| Audit log | Auth events, protocol mutations, order events, admin actions — retained 90 days | DB assertion |

### 8.3 Scalability

| Requirement | Target |
|-------------|--------|
| v1 user target | 1–50 users (personal + family/friends) |
| Architecture | Stateless API; single server sufficient at v1 scale; horizontal scale viable without rearchitecting |
| DB growth | < 1 GB Year 1; archive dose logs > 2 years old to cold storage if needed |
| Telegram sessions | 1 active session (Power User only; ordering is single-user in v1) |
| Concurrent users | Support 10 simultaneous authenticated sessions without degradation at v1 scale |

### 8.4 Availability

| Requirement | Target |
|-------------|--------|
| Uptime | 99% monthly (7.3 hours downtime/month acceptable for a personal tool) |
| Deploy strategy | Zero-downtime deploys via rolling update preferred |
| Backup | Daily automated DB backup; 30-day retention |
| RTO | 4 hours (personal tool; no SLA required) |
| RPO | 24 hours (last day's data at risk in worst-case total failure) |
| Failure behavior | If API is unreachable, dose log flow degrades to "offline pending" if technically feasible; otherwise shows clear "service unavailable" with no data loss |

### 8.5 Accessibility

- **Target:** WCAG 2.1 AA compliance for all pages accessible to Delegated Participants (dose logging, dashboard, reference pages)
- **Rationale:** Managed users may include older family members; basic accessibility ensures usability
- **Admin panel:** Best-effort; keyboard navigable; full WCAG compliance not required for v1
- **Testing:** axe automated scan on every CI build; manual keyboard navigation check on critical flows (dose logging, reconstitution calculator)

### 8.6 Browser & Device Support

| Tier | Scope | Commitment |
|------|-------|------------|
| **Supported** | Chrome (last 2), Safari (last 2), Firefox (last 2), Edge (last 2), Chrome for Android, Safari iOS (last 2) | All features work; regressions are P0 |
| **Unsupported** | IE 11, Safari < 14 | May not function; no engineering effort |

**Mobile priority:** The dose-logging flow is used on a phone at 7am. Dashboard + dose logging must be first-class on mobile. Reference pages and admin panel can be desktop-first with responsive fallback.

**PWA requirements (Must Have):**
- PWA manifest: app name, icons (192px, 512px), theme color, `display: standalone`
- Home screen install prompt: browser "Add to Home Screen" on mobile Chrome and Safari iOS
- Installed PWA: opens full-screen without browser chrome; back/forward navigation handled in-app
- Service worker: caches app shell for fast load; queues dose-log writes when offline and syncs on reconnection
- Offline behavior: dose logging works offline (queued writes); all other features show "offline" state gracefully
- Push notification support: Web Push API for dose reminders (§5.2.7); requires notification permission grant

### 8.7 Monitoring & Observability

For a solo developer who is also the operator, application monitoring is operationally necessary to detect silent failures.

| Requirement | Target |
|-------------|--------|
| Application error tracking | Unhandled server errors logged and surfaced; P0 errors (reconstitution math failure, payment flow error, audit write failure) alerted within 15 minutes |
| Telegram send failure | Failed MTProto sends surfaced in order history with error state; no silent discard |
| Uptime monitoring | External uptime check (e.g., Uptime Robot or equivalent); alert if unreachable > 5 minutes |
| Backup verification | Daily backup completion logged; alert on backup failure |
| Audit log integrity | DB assertion in integration tests that audit events are written; alert if audit write fails silently |

Specific tooling is a tech-stack decision. All monitoring tooling must fall within the §7.3 infrastructure budget.

### 8.8 Internationalization

**v1 scope:** English only. US locale only.
- Date format: MM/DD/YYYY (user-facing); ISO 8601 in UTC stored in DB
- Timezone: all timestamps stored in UTC; displayed in user's local browser timezone
- Currency: USD for vendor price catalog display; crypto labels shown as-is (USDT, BTC, ETH)
- Units: metric throughout (mcg, mg, mL, IU)
- i18n/l10n framework not required for v1. Re-evaluate at public launch (Year 2) if European users are targeted.

---

## 9. Competitive Context

*(Full competitive analysis in `docs/vision.md` §6. PRD summary only.)*

**Why competitors cannot build what we're building:**
- App-Store-bound trackers (PeptIQ, Smart Peptide Tracker, Titer, Peptify, SHOTLOG) structurally cannot integrate grey-market Telegram/crypto ordering. The ordering → inventory → dose data loop is our structural moat regardless of automation level.
- PeptPro (web, closest feature surface) uses their own curated vendor marketplace — not grey-market Telegram. They serve a fundamentally different user.
- No competitor closes the order → inventory → dose → outcome data loop.

**Features to learn from:**
- **PeptIQ:** injection site rotation UX (reportedly polished); reference their interaction pattern
- **Titer:** row-level security + CSV export as a privacy baseline; match their data controls
- **Peptify:** pharmacokinetic modeling as a v2+ signal; not v1 scope but worth designing a data model compatible with it
- **PeptPro:** wearable integration (Oura/Whoop) as a v2 biomarker signal; same reasoning

---

## 10. Phased Delivery Plan

> **Phase vs. MoSCoW alignment:** The MoSCoW table (§4) lists all features that must be complete before v1 is declared done. Phases below define build order — Must Have features are delivered across Phase 1 and Phase 2 in sequence, not all at once. V1 is "complete" when all Must Have and prioritized Should Have items have shipped.

### Phase 1 — Personal Tool (M0–M3)

**Goal:** Power User decommissions spreadsheet within 90 days. Places first order via app.

**Deliverables:**
1. Auth (email/password, accounts, sessions, password reset)
2. Compound reference pages (~20–30 from QSC catalog)
3. Protocol creation + daily dose logging (no injection site rotation yet)
4. Reconstitution calculator + vial inventory
5. Telegram MTProto auth + order builder + automated send + manual fallback
6. Basic order history and payment tracking

**Phase gate:** Power User logs doses every day for 14 consecutive days AND places 1 successful Telegram order via app.

> **Note on data export:** Account deletion with full data export (§5.7) is implemented in Phase 1 as part of Auth, even though the export-on-demand settings UI is refined in Phase 3. Phase 1 ships: account deletion + full JSON export generated at deletion time. Phase 3 adds: "Export my data" button in account settings at any time.

---

### Phase 2 — Family Adoption (M3–M6)

**Goal:** First Delegated Participants active and logging reliably.

**Deliverables:**
1. Multi-user system: admin panel, managed user invitation, simplified managed-user view
2. Injection site rotation tracking
3. Cycle management
4. Subjective outcome logging
5. Stack overview dashboard
6. Coinbase payment checklist (guided payment details capture)
7. Mobile-responsive polish on dose-logging and dashboard flows

**Phase gate:** 3+ Delegated Participants with active protocols, logging ≥ 5 days/week for 30 days.

> **Legal gate:** Before Phase 2 ships, complete the Phase 2 legal review (see §7.5) covering managed user data stewardship obligations.

---

### Phase 3 — Hardening + v2 Bets (M6–M12)

**Goal:** Validate personal-tool adoption. Begin v2 technology differentiators. Prepare for potential paid license.

**Deliverables:**
1. Protocol history view and cycle analytics (simple charts)
2. Data export (JSON) and full account deletion
3. AI Telegram response parser (v2 feature: reads vendor confirmation, auto-captures wallet address + total)
4. Automated PubMed watch (background job, email digest of new papers on stack compounds)
5. Legal review (required before paid license consideration)
6. Evaluate: lab data import / bloodwork correlation (v2 feasibility spike)

**Phase gate:** 20 successful orders total; Delegated Participant 7-day adherence ≥ 70%; legal review completed.

---

### Year 2+ Aspirations

| Feature | Dependency |
|---------|-----------|
| Paid lifetime license | Legal review passed |
| Compounding pharmacy order flow | Bridge-sourcing UX (architecture ready) |
| TRT/anabolic compound profiles | Compound profile schema already supports it |
| Lab data import + protocol-biomarker correlation | v2 feasibility spike from Phase 3 |
| Public reference site (SEO) | Personal-tool adoption validates content investment |
| Community features (opt-in, low-noise) | Year 2 only if personal-tool succeeds |

---

## 11. Risk Assessment

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Telegram MTProto session fragility (v1 critical path) | HIGH | MEDIUM | Graceful manual fallback in every ordering flow; explicit error states; session re-auth flow |
| Power User abandons the build before family adoption | HIGH | MEDIUM | Personal-tool-first phasing; M1 deliverables benefit Power User immediately. If no daily use after 30 days, pause and reassess. |
| Payment processor rejects paid license | HIGH | MEDIUM | Legal review before any paid launch. Base product = tracker/reference honestly described. Ordering = opt-in advanced module. |
| Telegram MTProto terms of service | MEDIUM | LOW | MTProto is a standard protocol; third-party clients are widespread. Single-user, single-vendor use is a normal personal use case. No mass-messaging. |
| Grey-market regulatory crackdown | MEDIUM | LOW | Sourcing module is architecturally isolatable. Bridge-sourcing design supports compounding pharmacy as an alternative from day one. |
| Legal exposure (grey-market ordering facilitation) | MEDIUM | LOW | Legal review before paid launch. Harm-reduction framing throughout. The user places the order; the app composes and sends the message on their behalf. |
| Managed user non-adoption | LOW | HIGH | Don't force adoption. Track usage. Only invest in managed-user UX that real managed users request. |
| Reference content quality decay | LOW | MEDIUM | Every profile cites primary sources; anecdote is labeled. AI drafts are human-reviewed before publish. |

---

## 12. Open Questions Resolved

| Source | Question | Decision |
|--------|----------|----------|
| Vision Q2 | Platform shape | Web app (multi-tenant, user accounts, no App Store) |
| Vision Q4 | Telegram automation scope (v1 vs. v2) | **v1 = full MTProto automation** (supersedes vision's guided-manual guidance); graceful manual fallback required |
| Vision Q5 | Multi-user architecture | Distinct accounts; Power User = super admin; managed users see own data only |
| Vision Q8 | Vendor sourcing scope | QSC-first for v1; architecture supports N vendors; v2 adds more |
| Vision Q9 | Legal review trigger | **Before paid license launch**; family/friend use is free until then |
| PRD discovery | Reference catalog depth | QSC catalog only (~20–30 compounds) for v1 |
| PRD discovery | Tracker v1 features | All four confirmed as Must Have: dose logging, injection site rotation, cycle management, subjective outcome logging |

**Still open (tech-stack step):**
- Q3 — Database + deployment technology choices
- Q10 — AI assistance technical approach (vector search? OpenAI? Local model?)

**Still open (later):**
- Q1 — Product name
- Q6 — Public reference site timing
- Q7 — Community features scope

---

*This PRD is the requirements baseline. Architecture decisions (`tech-stack`), user stories, and implementation planning all reference this document. If a requirement changes, update this document first — not the downstream artifact.*
