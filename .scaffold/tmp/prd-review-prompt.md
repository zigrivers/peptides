You are a senior product manager reviewing a PRD for a peptide tracking web app. Conduct a structured 8-pass review of the document below. For each pass, identify findings and assign severity: P0 (blocks downstream work), P1 (significant gap causing rework), P2 (improvement opportunity), P3 (polish).

## 8 Review Passes

1. **Problem Statement Rigor** — Specific user group? Quantitative evidence? Testable? No solution prescriptions?
2. **Persona & Stakeholder Coverage** — All stakeholders represented? Goal-driven with constraints? No "Everything User" anti-pattern?
3. **Feature Scoping Completeness** — In-scope/out-of-scope/deferred all present? Specific enough to estimate? PRD says WHAT not HOW?
4. **Success Criteria Measurability** — Every criterion has target value AND measurement method? Tied to problem statement?
5. **NFR Quantification** — All categories covered (performance, security, scalability, availability, accessibility, data retention, i18n, browser/device, monitoring)? Quantified with numbers not adjectives?
6. **Constraint & Dependency Documentation** — Technical/timeline/budget/team/regulatory constraints present? External integrations with API limits/costs documented?
7. **Error & Edge Case Coverage** — Sad paths for all features with user input? External dependency failures? Session expiry? Concurrent access?
8. **Downstream Readiness for User Stories** — Can stories be written without guesswork? Features specific enough to map to stories?

Output your findings as a JSON object with this structure:
```json
{
  "model": "codex",
  "findings": [
    {
      "id": "1.1",
      "pass": 1,
      "pass_name": "Problem Statement Rigor",
      "severity": "P1",
      "finding": "Brief description",
      "location": "Section reference",
      "recommendation": "How to fix"
    }
  ],
  "gate_recommendation": "Pass | Conditional Pass | Fail",
  "handoff_notes": "What the next phase (User Stories) should know"
}
```

## PRD to Review

---

# Product Requirements Document

**Status:** Draft
**Date:** 2026-05-20
**Vision source:** docs/vision.md

---

## 1. Problem Statement

**User group:** Advanced biohackers who self-direct multi-compound protocols (peptides, and in the near term TRT/anabolics) using grey-market vendors operating via Telegram.

**Pain:** Each of the four critical weekly tasks — researching a compound, placing an order, reconstituting a vial, and logging a dose — requires a different tool (browser/Obsidian, Telegram/PDF, a calculator, a spreadsheet). None of these tools know about each other. The user is the integration layer, and errors at any step translate to real harm: wrong reconstitution dose, lost crypto payment, or a missed injection.

**Hypothesis:** If we unify the four workflows (reference, ordering, reconstitution math, and dose tracking) into a single web app where each step is aware of the others, the Power User will abandon their existing four-tool workflow within 90 days and place at least 20 successful orders via the app within 12 months.

**Validation method:** Power User daily active use, spreadsheet and Obsidian notes decommissioned (self-reported), order history in app ≥ 20 successful orders in Year 1.

---

## 2. Target Users

### 2.1 Primary Persona — Power User / Super Admin
| Dimension | Detail |
|-----------|--------|
| Description | Self-directed biohacker running 3-7 concurrent peptide protocols; manages sourcing independently. Also manages peptide access for 2-10 family members or close friends. |
| Primary need | One tool that connects research → ordering → reconstitution → daily dosing → outcome logging without the user being the integration layer. |
| Current behavior | Obsidian for research notes, browser tabs for PubMed, Telegram for vendor orders, Coinbase for crypto payments, spreadsheet for dose logging, calculator tab for reconstitution math, calendar notes for cycle tracking. |
| Constraints | Solo builder (is also the developer). Dose window is 3-5 minutes at 7am. Uncomfortable with "research use only" compliance theater. |
| Success looks like | Opens one app at 7am. Sees today's stack. Logs doses in < 60 seconds. App sends Telegram message to vendor automatically, user confirms crypto payment, inventory updates. Spreadsheet decommissioned within 90 days. |
| Admin role | Creates and configures managed user accounts. Configures protocols for Delegated Participants. Can view all managed users' adherence dashboards. |

### 2.2 Secondary Persona — Delegated Participant (managed user, v1)
| Dimension | Detail |
|-----------|--------|
| Description | Family member or close friend on 1-2 peptides, guided by the Power User. Does not self-research or order independently. |
| Primary need | See their daily injection schedule, confirm doses, and understand what they're taking — without navigating a complex interface. |
| Current behavior | Texting the Power User for every question. Sometimes guessing the dose. Sometimes skipping out of uncertainty. |
| Constraints | Non-technical. Low tolerance for complexity. Cannot configure their own protocol. First reconstitution done with Power User present. |
| Success looks like | Opens app, sees "today: 250mcg BPC-157, left abdomen." Taps confirm. Closes app. Zero texts to the Power User asking "how much do I take?" |
| v1 scope | Account created and protocol configured by Power User only. No self-serve onboarding. No ordering capability. Simplified view: schedule + dose logging + peptide info only. |

### 2.3 Adjacent Audience (v2 horizon, not v1)
- TRT / anabolic users
- Compounding pharmacy patients

### 2.4 Non-Users (explicitly out of scope for v1)
- Clinicians and prescribers
- Mass-market wellness consumers
- Anonymous SEO visitors
- Anyone seeking AI-personalized dose recommendations

---

## 3. Feature Scope Summary

### 3.1 In Scope (v1)
| Pillar | Features |
|--------|----------|
| Reference | Peptide profile pages; browse/search catalog; ~20-30 compounds from QSC catalog |
| Tracker | Protocol creation + management; daily dose logging; injection site rotation; cycle management; subjective outcome logging; vial inventory; stack overview dashboard |
| Reconstitution | BAC water + concentration calculator; syringe unit calculator; integration with dose history and vial inventory |
| Ordering | Vendor catalog (QSC-first); order builder; automated Telegram message dispatch via MTProto; payment capture checklist; order history; inventory update on delivery |
| Multi-user | Super admin panel; managed user account creation; protocol assignment; adherence visibility; simplified managed-user view |
| Auth | Email/password accounts; secure sessions; password reset; account deletion with data export |

### 3.2 Out of Scope (will NOT be built in v1)
- AI-generated dose recommendations or stack optimization
- Community features
- Public reference site / SEO
- App Store distribution
- Automated Telegram response parsing (v2)
- Automated crypto payment execution
- Wearable integration
- Lab data / bloodwork import
- TRT/anabolic compound profiles (architecture supports; profiles deferred)
- Compounding pharmacy order flow
- Self-serve managed-user onboarding
- Multi-vendor ordering (QSC only)
- Paid license / billing system

### 3.3 Deferred (v2+)
AI Telegram response parser, PubMed watch, lab data import, TRT/anabolic profiles, multi-vendor ordering, community features, compounding pharmacy sourcing, public reference, paid license.

---

## 4. MoSCoW Prioritization

### Must Have
- Dose logging
- Protocol management
- Reconstitution calculator
- Compound reference pages (QSC catalog)
- Automated Telegram ordering + manual fallback
- Order history + inventory capture
- Multi-user admin panel
- Auth

### Should Have
- Injection site rotation
- Cycle management
- Subjective outcome logging
- Vial inventory tracking
- Stack overview dashboard
- Coinbase payment checklist
- Peptide search/browse

### Could Have
- Protocol history
- Cycle analytics
- PDF price import
- Mobile-optimized layout
- Dark mode

---

## 5. Feature Specifications

### 5.1 Reference
Peptide profiles with: mechanism, benefits (with PubMed citations), dosing ranges (low/typical/high), administration routes, reconstitution guidance, half-life notes, side effects, citations, sourcing note.
Catalog: ~20-30 compounds from QSC vendor PDF.
Search by name, browse by category.
Error: compound not yet profiled → "Profile in progress" placeholder, not 404.

### 5.2 Protocol Tracker

#### Protocol Definition
Fields: compound (FK to catalog), dose amount (mcg/mg/IU/mL), frequency (daily/EOD/weekly/custom), route, start date, optional end date, cycle association, notes.
Errors: no compound → blocked; dose = 0 → blocked; past start date → allowed.

#### Daily Dose Logging
Flow: dashboard shows today's doses → tap dose → confirm amount + site + optional note → saved with timestamp.
Log record: protocol FK, actual dose, timestamp (editable within same day), injection site, note, logged-by user ID.
Errors: vial inventory = 0 → warning not block; duplicate same day → confirmation required.

#### Injection Site Rotation
Sites: L/R abdomen, thigh, deltoid, ventrogluteal. Round-robin suggestion per compound. User can override. 7-injection visual history.
Error: no history → no suggestion.

#### Cycle Management
Fields: name, start/end date, linked protocols, scheduled breaks, status (active/paused/completed).
Dashboard: shows current cycle week, break indicator.
Error: overlapping cycles → warning not block.

#### Subjective Outcome Logging
Daily: overall rating (1-5), per-protocol rating, free-text note (1000 chars), tag multi-select (energy/sleep/mood/pain/recovery/libido/cognition).
Display: last 14 days timeline.

#### Stack Overview Dashboard
Shows: active protocols with today's dose status; cycle week; vial inventory indicator; 7-day rating average; quick-log action.

### 5.3 Reconstitution Calculator
Inputs: compound, vial size (mg), BAC water volume (mL), target dose (mcg/mg).
Outputs: concentration, syringe units on 100U insulin syringe, cross-check against reference low/typical/high.
Records reconstitution event as vial record.
Safety guardrails: warn if dose > reference high; warn if volume > 1.5mL; warn if BAC water < 0.5mL.
Errors: BAC water = 0 → block; vial size = 0 → block; dose > vial content → warning; negative values → block.

### 5.4 Ordering (Telegram + Crypto)

**v1 = full MTProto automation** (supersedes vision guidance for guided-manual). Graceful manual fallback required in ALL ordering flows.

#### Telegram Auth Setup
Flow: phone number → Telegram code → encrypted MTProto session stored server-side → vendor Telegram username configured.
Fallback: composed message always copyable; "Open in Telegram" deep-link always visible.
Errors: expired code, invalidated session, vendor not found.

#### Vendor Catalog
Fields: compound, forms, vial sizes, price, in-stock flag, min order qty. Manual entry from QSC PDF.

#### Order Builder
Flow: browse catalog → add to cart → review → compose Telegram message → user reviews → click Send → MTProto sends to vendor → order recorded as "Sent - awaiting confirmation."
Fallback: message copyable + deep-link always visible.
Errors: send fails → show error + fallback; empty cart → disabled; no price → soft warning.

#### Order Tracking & Payment
Flow: order sent → user reads vendor Telegram reply manually → enters total + currency + wallet address → payment confirmation screen (wallet + amount visible) → user pays from Coinbase manually → enters tx ID (optional) → "Mark payment sent" → order status: "Payment sent - awaiting shipment" → "Mark received" → inventory update prompt.
Safety gate: wallet address required before "Mark payment sent."
Errors: no wallet address → blocked; "Mark received" before "payment sent" → warning + confirm.

MISSING: No cancel order or order timeout/expiry defined.

### 5.5 Multi-User & Admin
Admin: create managed users (invite email), configure protocols for managed users, view adherence, edit/deactivate protocols, reset passwords, deactivate/delete managed accounts.
Managed user: dose logging, view own schedule/history, reference lookup, reconstitution calculator (read-only), password change.
Managed user CANNOT: create protocols, order, see other users, access admin panel.
Errors: duplicate email invite → error; admin delete with active managed users → blocked; managed user accesses ordering → 403.

MISSING: Invite link expiry not specified. No resend invite flow.

### 5.6 Auth
Email/password (bcrypt cost 12+), httpOnly session cookie (30-day rolling), password reset (1-hour expiry link, single-use), min 12 chars.
Errors: wrong password → generic error; unknown email reset → success message anyway; account deletion with active managed users → blocked.

### 5.7 Data Export & Privacy
Export: full JSON of all user data; < 10MB immediate; >= 10MB async with email link.
Deletion: irreversible; 48-hour delay or immediate double-confirm; managed users must be deactivated first.
Privacy: no analytics, no third-party sharing, no engagement tracking; audit log 90-day retention.

---

## 6. Success Criteria

### Hard Gates
- Zero dose-calculation defects (unit tests with reference values)
- 100% of crypto payments require explicit wallet + amount confirmation
- Zero silent failures (E2E test suite)
- 100% audit log completeness (DB assertion)

### Phase 1 (months 1-3)
- Power User daily active use: 14 consecutive days logged
- Spreadsheet decommissioned within 90 days (self-reported)
- First order via app (MTProto, no manual intervention)
- Protocol setup: < 5 minutes for 3-compound protocol
- Reconstitution calc accuracy: unit test suite

### Phase 2 (months 3-6)
- Managed user count: 3-10 with >= 1 active protocol
- Delegated Participant retention: >= 70% logging >= 5 days/week for 30 days
- Power User support burden: < 5 texts about app in first 30 days (self-reported)
- Ordering reliability: >= 20 successful orders; < 3 manual fallback uses; measured by "order history + fallback flag"

### Year 1
- >= 20 successful orders end-to-end
- 30-50 peptide profiles with citations
- Power User daily use; spreadsheet decommissioned

### Year 3 Aspirational
- 100-1,000 active users
- Referenced as "the honest peptide app" in community forums (measurement: community monitoring)
- Sustainability: hosting + maintenance covered by license revenue

---

## 7. Constraints

### Technical
- Web app only, no App Store
- Telegram: MTProto client (e.g., gramjs for Node.js); not official Bot API; session stored encrypted server-side
- Database: PostgreSQL preferred
- Deployment: < $100/month at 1-50 users
- Crypto: manual payment only, no custodial wallet

### Timeline
- No hard deadline. Milestones: M1 = dose logging + recon; M2 = ordering; M3 = multi-user.

### Budget
- Solo developer, no contractors
- Infrastructure: < $100/month at 1-50 users; < $500/month at 51-500 users
- Third-party: PostgreSQL hosting, transactional email (Resend/Postmark), object storage
- No revenue in v1

### Team
- Solo developer
- No design team (use component library)
- No QA team (automated tests required; 100% coverage on reconstitution math + payment confirmation)

### Regulatory
- Legal review before paid license
- No HIPAA, no GDPR for v1 (US personal tool)
- Sourcing is removable module

---

## 8. Non-Functional Requirements

### Performance
- FCP: < 2.5s on broadband (Lighthouse CI, fail > 3.0s)
- API read: p95 < 200ms (k6, fail > 300ms)
- API write: p95 < 500ms (k6, fail > 800ms)
- Dose log submit: < 500ms E2E (fail > 1s)
- Reconstitution calc: < 100ms client-side (fail > 500ms)
- Telegram order send: < 5s (fail: show progress > 10s, timeout > 30s)

### Security
- bcrypt cost >= 12; httpOnly cookie SameSite=Strict; AES-256 Telegram session; TLS 1.2+; HSTS; CSP; parameterized queries; IDOR user_id scoping; audit log 90 days

### Scalability
- 1-50 users v1; stateless API; 1GB DB Year 1; 1 Telegram session; 10 concurrent sessions

### Availability
- 99% monthly uptime; zero-downtime deploys; daily DB backup (30-day retention); RTO 4h; RPO 24h

### Accessibility
- WCAG 2.1 AA for managed-user flows; axe automated scan; manual keyboard nav check

### Browser Support
- Supported: Chrome/Safari/Firefox/Edge last 2 + Chrome Android + Safari iOS last 2
- Mobile dose-logging is first-class

---

## 9. Competitive Context
App-Store-bound trackers cannot integrate grey-market ordering. PeptPro uses own marketplace, not Telegram. No competitor closes order → inventory → dose → outcome loop.
Learn from: PeptIQ injection site UX, Titer data controls, Peptify pharmacokinetic data model for v2.

---

## 10. Phased Delivery

Phase 1 (M0-M3): Auth + reference + protocol/dose logging + recon calc + Telegram ordering
Phase 2 (M3-M6): Multi-user + injection rotation + cycles + outcomes + dashboard + payment checklist
Phase 3 (M6-M12): Protocol history + analytics + data export + AI Telegram parser + PubMed watch + legal review

Year 2+: Paid license, compounding pharmacy, TRT profiles, lab data import, public reference, community.

---

## 11. Risk Assessment
- HIGH: Telegram MTProto fragility (mitigation: manual fallback always present)
- HIGH: Power User loses interest (mitigation: personal-tool-first phasing)
- HIGH: Payment processor rejects paid license (mitigation: legal review before paid launch)
- MEDIUM: MTProto ToS violation (low probability)
- MEDIUM: Regulatory crackdown (mitigation: bridge-sourcing architecture)
- MEDIUM: Legal exposure
- LOW/HIGH: Managed user non-adoption
- LOW/MEDIUM: Reference content quality

---

## 12. Open Questions Resolved
- Platform: web app
- Telegram scope v1: full MTProto automation + manual fallback
- Multi-user: super admin model
- Vendor scope: QSC-first
- Legal trigger: before paid launch
- Reference depth: QSC catalog ~20-30 compounds
- Tracker features: all 4 are Must Have
