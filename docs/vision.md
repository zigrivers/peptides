<!-- scaffold:vision v2 2026-05-20 -->
<!-- scaffold:innovate-vision v1 2026-05-20 -->
# Product Vision

> **Working name:** *Project Peptides* (placeholder — see Open Questions)

## 1. Vision Statement

**Give serious peptide users one honest place to learn, dose, track, and source — without pretending the grey market doesn't exist.**

## 2. Elevator Pitch

> For **serious biohackers and the family/friends they guide** who **self-direct complex protocols — peptides, TRT, and related compounds — outside or alongside the telehealth mainstream**, *Project Peptides* is a **self-directed biopharmaceutical management platform** that **unifies a deep evidence-based reference, multi-user protocol tracking, reconstitution math, biomarker correlation, and end-to-end vendor ordering (grey-market Telegram + crypto or compounding pharmacy) in one honest tool**. Unlike **App-Store-bound trackers (PeptIQ, PeptPro, Peptify) and reference-only sites (PepGuide, Know Your Peptide)** that can't touch ordering or are locked into their own vendor ecosystems, our product **treats the user's actual sourcing workflow as a first-class feature and the user as a competent adult managing their own biology**.

## 3. Problem Space

A specific user lives this every week:

- **Information is shattered across ten tabs.** They keep a peptide research note in Obsidian, a dose calculator bookmarked, the vendor's Telegram open, a screenshot of a Reddit dosing protocol, a YouTube video from a longevity podcaster, a PubMed paper from 2019, and a spreadsheet of what they took yesterday. Nothing talks to anything else. When a new peptide enters their stack, they redo this synthesis from scratch.
- **Ordering is friction theater.** Their vendor sells through Telegram. Placing an order means: scroll a PDF price list, message a human, wait for confirmation, get a quoted total, get a wallet address, open Coinbase, send crypto, screenshot the transaction back to Telegram, wait for shipment confirmation, manually note it down somewhere. Errors cost real money in non-reversible crypto.
- **Tracking is a notes-app crime scene.** They're running 3-5 peptides on different schedules — some daily, some pulsed, some cycled. They're also helping their spouse run two peptides on a different schedule. There is no calendar that knows what BPC-157 looks like for him vs. her, what cycle week he's in, when the next vial expires, or whether his next injection should hit the deltoid because the last three hit the abdomen.
- **Reconstitution math at the kitchen counter is dangerous.** Vial arrives. They're holding a 31G insulin syringe. They need to know: how much BAC water, what unit mark equals 250mcg, whether 250mcg is the right dose given they just bumped from 200mcg yesterday. Existing calculators do the math; they don't remember yesterday's dose.

**Root cause:** Every existing tool serves *part* of the workflow under App Store / payment-processor / "research use only" constraints that prevent it from serving *all* of it. The user is the integration layer, and they're tired of being the integration layer.

**Size:** Reddit r/Peptides has 250k+ members. r/Biohackers, r/longevity, r/SteroidsCommunity overlap heavily. The grey-market peptide vendor ecosystem (QSC, AminoAsylum, etc.) clearly moves enough product to sustain dozens of vendors. The total population of "serious peptide user who orders outside telehealth" is plausibly in the low hundreds of thousands in the US alone — not mass-market, but large enough.

## 4. Target Audience

### Primary Persona — *The Power User (you)*
- **Behavior:** Runs multi-peptide stacks (3-7 concurrent). Cycles intentionally. Logs subjective + biomarker outcomes. Reads PubMed. Comfortable with crypto, Telegram, and self-directed health decisions.
- **Context of use:** Daily — morning dose logging, weekly — reviewing outcomes, monthly — ordering/restock, occasional — researching a new peptide before adding it.
- **Workarounds today:** Obsidian notes + spreadsheet + bookmarks + Telegram threads + Coinbase + a calculator tab. Functional but degrades as the stack grows.
- **Success for them:** Open one app at 7am. See today's stack. Confirm doses. Log them. Close the app. At order time: app drives the Telegram + crypto handshake instead of the human.

### Secondary Persona — *The Delegated Participant (family & friends, v1)*
- **Behavior:** First or second peptide. Has their account created and protocol configured *by the Power User* (super admin). Does not need to understand reconstitution math — they just see their schedule and log doses. May occasionally look up "what does this peptide do?"
- **Context of use:** Daily injection (habit-forming), occasional educational lookup. First reconstitution is handled with the Power User present, guided by the app's reconstitution flow.
- **Workarounds today:** Texting the Power User for every question. Sometimes guessing the dose. Sometimes skipping out of uncertainty.
- **Success for them:** Open the app, see "today: 250mcg BPC-157, left abdomen," confirm, close. Never need to know the reconstitution math. Never text the Power User asking what to do.
- **v1 scope note:** Delegated Participant is a *managed user* — their protocol is configured and visible to the Power User (super admin). Self-serve newcomer onboarding (account creation, protocol setup from scratch) is a Year 2 feature.

### Adjacent audience (v2 horizon)
- **TRT / anabolic users** — Testosterone, HCG, AI/AR compounds sit in the same grey-market Telegram + crypto ecosystem as peptides. Same Power User persona, same vendor network, same ordering friction. The v1 architecture supports them without a separate product; v2 adds compound profiles and protocol templates.
- **Compounding pharmacy patients** — As grey-market access narrows under regulatory pressure, peptide users may migrate to telehealth / compounding pharmacy sourcing. The bridge-sourcing architecture accommodates both flows from day one.

### Explicitly NOT the primary audience (Year 1)
- Clinicians and prescribers
- Mass-market wellness consumers
- GLP-1-curious newcomers (not self-directed, want a concierge)
- Anonymous public users via SEO (Year 2+ at earliest)

## 5. Value Proposition

The unique value, framed as outcomes:

1. **One workflow instead of ten tabs.** Order → receive → reconstitute → schedule → dose → log → review — all in one tool. The user stops being the integration layer.
2. **Vendor ordering that actually works.** Drive the Telegram + Coinbase handshake from a UI instead of a chat thread. Capture the order, the payment, the shipment, and the resulting inventory automatically.
3. **A reference written for the user who is actually going to take this peptide.** Not "research use only" boilerplate. Honest dosing ranges, real mechanism explanations, primary research citations, and "here's what to actually watch for."
4. **Multi-user that respects relationships.** Power User (super admin) creates and manages family/friend accounts, configures their protocols, and can review their adherence — without exposing the full advanced UI to managed users. Each user sees only their own data.
5. **User-controlled data, never exploited.** Your peptide log doesn't fund our product decisions. No data selling, no protocol-data analytics, no engagement tracking. You can export or delete everything.
6. **Biomarker-protocol correlation.** Import bloodwork from InsideTracker, LabCorp, or a PDF upload. Overlay IGF-1, testosterone, CRP, and GH markers against your protocol timeline. See whether the stack is doing what you think it is.
7. **Multi-source ordering that survives regulatory shifts.** Guides both grey-market Telegram + crypto flows AND compounding pharmacy / telehealth orders from a single interface. One tool whether your peptides come from QSC or a licensed compounding pharmacy.

**Sourcing module scope (v1):** The ordering integration in v1 means: structured vendor catalog, guided order composition (app composes the Telegram message), payment checklist, and inventory capture after confirmation. Full Telegram automation (bot sends messages without user action) is a v2 stretch goal. In v2, an AI Telegram response parser reads vendor confirmations and auto-updates order status and inventory — more resilient than a scripted bot. The moat is the *closed data loop* — order → inventory → dose → log — not just the automation.

**Why not "do nothing":** The user already does nothing — they cope with the tab-soup. The cost is mental overhead, occasional dose errors, and ordering mistakes that translate into lost crypto. The pain is real and recurring.

## 6. Competitive Landscape

The 2025-2026 peptide-app explosion is real. Honest survey:

### Direct competitors — peptide trackers
- **PeptIQ** (Jan 2026, iOS + Android + web) — *Strength:* GPT-4 protocol generation, injection-site rotation, polished cross-platform UX, 35+ peptide profiles with research refs. *Weakness:* App-Store-bound — cannot touch ordering, cannot be honest about grey-market vendors, cannot integrate Telegram/crypto. Single-user focused.
- **Smart Peptide Tracker** (200+ peptides, iOS + Android, freemium) — *Strength:* Largest in-app peptide library, Stack Analyzer (synergy/redundancy/side-effects radar), one-time-purchase premium model, free core. *Weakness:* No ordering, no community, App-Store compliance theater, single-user.
- **PeptPro** (web + mobile, €9.99–19.99/mo subscription) — *Strength:* Claims "first platform connecting sourcing + protocol + tracking + biomarkers"; wearable integration (Oura, Whoop); AI bloodwork analysis; offline-first encrypted; broadest feature surface of any competitor. *Weakness:* Sourcing = their own curated vendor marketplace (NOT grey-market Telegram/crypto) — the model is fundamentally different and excludes the grey-market user. Subscription pricing paywalls core features. Does not serve users who order outside their ecosystem.
- **Peptify** (iOS App Store) — *Strength:* Pharmacokinetic modeling, bloodwork OCR, 80+ biomarkers, 61 PubMed-cited compounds, interaction checker — impressive technical depth. *Weakness:* App-Store-bound (cannot touch ordering), iOS-only, no multi-user, no ordering of any kind.
- **Titer** (titer.app) — *Strength:* Privacy-first positioning (AES-256, row-level security, CSV export, no data selling), multi-compound, injection site rotation. Directly competes with our privacy values. *Weakness:* App-Store-bound, no ordering integration, single-user, no reference depth.
- **SHOTLOG** (iOS + Android) — *Strength:* Custom protocol management, reconstitution calculator, vial inventory, injection site rotation, wellness journal, body metrics. *Weakness:* App-Store-bound, no ordering, no multi-user, no reference.
- **Regimen** (iOS + Android) — *Strength:* Covers TRT + peptides + GLP-1 + HRT in one tracker — broadest protocol scope. *Weakness:* App-Store-bound, jack-of-all-trades may be master of none for peptide-specific workflows.
- **Shotlee** (free) — *Strength:* Completely free, dose logging, side-effect tracking, protocol management. *Weakness:* Free means no business incentive for depth; App-Store-bound, no ordering.
- **The Pep Planner, PepTracker, PeptideKit** — Various B-tier trackers, mostly App-Store-bound, narrow feature scope.

### Direct competitors — reference sites
- **PepGuide.io** — 369 peptide profiles, the largest reference database. *Strength:* Breadth. *Weakness:* Reference-only — doesn't help you actually take the peptide, no tracking, no ordering, ad-supported.
- **Know Your Peptide** — 162+ peptides, peer-reviewed citations. *Strength:* Citation rigor. *Weakness:* Same — reference-only.
- **PeptideDosages.com, PeptideDeck, Peptides Helper, Peptide Dosing Protocols** — Variations on the same theme. Some include AI assistants.

### Calculator-only tools
- **PepCalc, PeptideCalc.io, Peptides Calculator** — Solve the reconstitution math problem in isolation. Useful, narrow.

### Indirect alternatives
- **Spreadsheets + Obsidian + Telegram + Coinbase** — The status quo. Strong because it's *already in use* and free. Weak because the user is the integration layer.
- **Telehealth peptide clinics** (Aspire Health, Henry Meds, etc.) — Industry trend toward "legitimization" via prescribed/compounded peptides. *Strong:* Legal, insurance-adjacent, professional oversight. *Weak:* Limited to FDA-cleared/compounded compounds, expensive, slow, won't touch novel peptides, paternalistic.
- **r/Peptides + Discord servers** — Free, community-driven knowledge. *Strong:* Real users, real outcomes. *Weak:* Signal-to-noise, no tooling, vendor shilling.

### The honest "do nothing" case
The user already gets by with their tab-soup. Building this only matters if the integration is dramatically better than the sum of free parts.

### Genuine differentiation (not wishful thinking)
- **The ordering data loop is the moat** — not just automation. No App-Store tracker can touch ordering. But even in "guided manual" v1, this product captures order → inventory → dosing schedule as connected data. No competitor closes that loop. Full Telegram automation is a v2 multiplier on a moat that exists from day one.
- **Grey-market-first web app.** App Stores are closed to this product by design. Titer has privacy; PeptIQ has AI; Smart Peptide Tracker has breadth; PeptPro has biomarkers — but all are App-Store-bound or locked to their own vendor marketplace and can't serve this user's actual sourcing workflow. We own the web.
- **Super admin / multi-user management.** Almost every competitor is single-user focused. The Power User managing protocols for family members from a web admin panel is a unique capability.
- **TRT / anabolics adjacency on the same toolchain.** No competitor spans peptides + testosterone + anabolics in a single grey-market-aware platform. The same Telegram/crypto ordering layer serves the user's full self-directed stack without switching apps.
- **Bridge-sourcing survives regulatory shifts.** As FDA tightens grey-market peptide access (2026 trend), the product supports compounding pharmacy + telehealth orders alongside Telegram/crypto. A grey-market-only tool becomes unusable if the landscape shifts; this one adapts because sourcing is order-source-agnostic.
- **Biomarker correlation without vendor lock-in.** PeptPro gestures at AI bloodwork analysis — but it's locked to their own marketplace. We bring protocol-biomarker correlation to the user's actual sourcing workflow, regardless of where they buy.
- **All-in-one.** Loses on isolated dimensions (PepGuide has more peptides; PeptIQ has nicer UI; Titer has stronger privacy branding; Peptify has pharmacokinetic depth) but wins on integration nobody else can ship.
- **Honest tone earns trust** — a structural advantage because it's *consistent with the architecture*, not a brand claim competitors can copy without rebuilding their compliance posture.

### Honest weaknesses to acknowledge
- Reference depth will lag PepGuide for years.
- UI polish will lag PeptIQ (well-funded, professional design team).
- Wearable integration (Oura, Whoop) will lag PeptPro.
- Mobile-app distribution is closed off (App Stores will reject this product). Web/PWA is the only viable channel.
- No professional medical oversight — that's deliberate, but it's a real limitation for some users.

## 7. Guiding Principles

These constrain real decisions. Each implies a tradeoff a reasonable team might reject.

### Principle 1 — *We choose evidence over hype.*
Every peptide profile cites primary research. Anecdote is labeled as anecdote. We will refuse to add buzzy peptides until we can write a defensible profile, even when the community is excited. **Tradeoff:** We will lag trends. We will lose some users to flashier competitors.

### Principle 2 — *We choose power-user defaults over accessibility-first design.*
Default surfaces are dense, data-rich, and expert-friendly. Delegated Participants get a simplified view configured *by the Power User*, not a dumbed-down version of the same interface. When in doubt about a design decision, the Power User's workflow wins. **Tradeoff:** Cold-open newcomers who land on this product without a Power User guiding them will bounce. We are not optimizing for SEO-acquired strangers.

### Principle 3 — *We choose honesty about grey-market reality over compliance theater.*
We don't pretend research peptides are FDA-approved consumer products. We don't hide ordering. We don't write "for research use only" disclaimers we don't mean. We *do* speak in harm-reduction terms. **Tradeoff:** App Stores reject us. Payment processors are cautious. Some users will be uncomfortable.

### Principle 4 — *We choose user-controlled data over engagement-driven data mining.*
The product is a web app with user accounts. User data lives in our DB — but it is never sold, never used to train models, never analyzed for product decisions, and users can export or delete everything at any time. We do not build a recommendation engine off aggregate protocol data. Community features are opt-in, not the spine. **Tradeoff:** Harder viral growth (no "your friends are using X peptide" loops), no telemetry-driven product decisions (we must do manual user research instead).

### Principle 5 — *We choose integration depth over feature breadth.*
We'd rather do the four pillars (reference, tracker, reconstitution, ordering) deeply and connectedly than ship a thin community feed or a half-built coach AI. **Tradeoff:** We will look smaller than competitors on feature-matrix comparisons.

## 8. Anti-Vision

What this product is NOT — and the traps to avoid:

- **NOT a medical/clinical tool.** No HIPAA. No EHR. No prescriber workflows. No "talk to a doctor" upsell.
- **NOT a vendor storefront.** We do not sell peptides. We help users interface with *their chosen* vendor. We will refuse offers to white-label as a vendor's storefront.
- **NOT a hype/engagement platform.** No follower counts. No leaderboards. No "stack of the week" influencer content. No notifications designed to bring users back. Resist every Reddit/TikTok dynamic.
- **NOT a generalist health app.** We will refuse to expand to general supplements, nootropics, fitness tracking, sleep, food logging. Peptides are the focus. If we find ourselves building a habit tracker, we've lost the plot.
- **NOT an "AI peptide coach."** Generative recommendations on real protocols carry real liability and erode the evidence-over-hype principle. *Allowed AI uses:* citation extraction, paper summarization, peptide profile drafting for human review. *Disallowed:* personalized dose recommendations, stack optimization, safety clearance claims.
- **NOT mass-market.** We are not pursuing the GLP-1-curious wellness consumer. We are not the on-ramp; we are the operations system for users who already self-identify as serious.

**If we find ourselves doing any of these, we have lost the plot.**

## 9. Business Model Intuition

### Revenue model — *One-time purchase, lifetime license (primary). Optional vendor referral (secondary, contingent on real value to user).*

- **Primary: one-time license.** A single price (probably $50-150) unlocks the full product. Lifetime license, no subscription treadmill. Aligns with the "personal tool that grows" ethos and the privacy principle (you're not the product).
- **Secondary: vendor referral / margin.** If a vendor offers a referral arrangement *and* it doesn't compromise the user's price or independence, take it. Disclose it. Never let it bias which vendors the sourcing tool recommends.
- **Explicitly rejected: subscription, ads, data sales, freemium with feature lockouts on safety features (reconstitution math is never paywalled).**

### Unit economics direction
- One-time license = no recurring revenue, but recurring hosting costs (web app with user accounts and DB). Sustainability requires either license price × adoption to cover ongoing hosting + maintenance, or a modest add-on mechanism for updates.
- Ongoing costs to plan for: server hosting, DB, backups, vendor flow maintenance, security updates, reference content upkeep.
- Vendor referral is upside, not the spine.
- **Sustainability assumption:** If annual hosting + maintenance cost exceeds $1,000/year, a "supporter upgrade" or paid content module may be needed to fund ongoing development. Lifetime license works at low user counts; revisit if user base exceeds ~500.

### Go-to-market intuition
- **Year 1:** Word-of-mouth from the Power User's circle. No paid acquisition. No SEO push (the public reference site is a Year 2 question).
- **Year 2+ (if pursued):** Quiet visibility in r/Peptides, biohacker Discords, and longevity newsletters. *Not* TikTok, *not* paid ads. The audience self-selects.

### What would make this economically unviable
- If hosting/legal costs ever exceed license revenue
- If a payment processor ban makes selling the license itself difficult
- If the user (you) loses interest before family adoption validates it

## 10. Success Criteria

### Non-negotiable quality thresholds (all versions)
- Zero known dose-calculation defects (reconstitution math is safety-critical)
- Payment confirmation step before any crypto transaction is executed
- Audit log for all protocol changes (who changed what, when)
- No order or dose can be silently lost — every failure has a visible error state and recovery path

### Leading indicators (months 1-6)
- The Power User opens the app every day without prompting
- The Power User abandons their spreadsheet and Obsidian notes for peptide logging
- The first vendor order is placed successfully through the app

### Year 1 success (depth-5 horizon: 12 months)
- **Personal adoption locked in.** The Power User uses it daily. Spreadsheet is decommissioned.
- **Family/friend adoption: 3-10 users.** Each has at least one active protocol configured by the Power User. They check in for their daily dose.
- **Ordering loop closed end-to-end.** At least 20 successful orders placed through the app with no manual Telegram intervention required.
- **Reference depth: 30-50 peptides** with primary citations, dosing ranges, mechanism notes.

### Year 3 aspirations (if pursued past personal-tool stage)
- 100-1,000 active users, primarily from organic biohacker-community reach
- The product is referenced as "the honest peptide app" in community forums
- Sustainable on license revenue alone (no investor pressure)
- Reference has 100+ peptide profiles, comparable to mid-tier competitors

### Failure modes (even if it ships)
- **Power User stops using it within 90 days.** If the integration value isn't real for the builder, it isn't real for anyone.
- **Family adoption never materializes.** The newcomer onboarding doesn't actually onboard.
- **Ordering integration proves too fragile.** Vendor changes Telegram flow weekly; the bot breaks more than it helps.
- **The honesty principle wavers.** We add "for research use only" disclaimers we don't mean to placate a payment processor — we've lost the plot.
- **Scope-creep into general health.** A "sleep tracker" PR is the canary; if it gets merged we've lost the plot.

## 11. Strategic Risks & Assumptions

### Key assumptions
1. **The Power User (you) will actually use what you build.** If interest fades after the build, family adoption likely fades too. *Mitigation:* personal-tool-first sequencing; ship the parts that benefit you immediately.
2. **The Telegram + crypto ordering flow is automatable.** Vendors don't run formal APIs; they're humans on Telegram. A bot can drive the conversation but is fragile. *Mitigation:* Ship a "guided manual mode" first (the app composes the message, the user sends it). Full automation is a v2 stretch goal. In v2, an AI Telegram response parser reads vendor confirmations (rather than a scripted bot), making automation more resilient to vendor flow changes.
3. **Family/friends are willing to adopt a peptide-tracking app at all.** Some will prefer texting you. *Mitigation:* Build for the ones who are willing; don't force.
4. **Grey-market vendor sourcing remains legally viable in the user's jurisdiction.** A crackdown changes the audience overnight. *Mitigation:* The reference/tracker product survives a sourcing-mode shutdown; design the architecture so sourcing is a removable module.
5. **The crowded tracker market doesn't crush a personal-tool-with-extras.** Because we're not competing on the App Store and not pursuing the same users, this is plausible. *Mitigation:* Don't compete on PeptIQ's terms. Compete on the integration nobody else can ship.

### Severity-ranked risks
- **HIGH — Payment processor exposure.** Selling a license for a tool that includes an ordering module may trip Stripe / similar. *Mitigation:* The ordering module is an opt-in advanced feature — the base product is honestly described as a peptide tracker and reference web app. Use mainstream processors (Stripe) for the base license; accept crypto or use permissive niche processors for users who unlock the ordering module. Do not misrepresent the product to processors — that violates Principle 3.
- **HIGH — Telegram bot fragility.** If the vendor changes their Telegram flow, the ordering integration breaks. *Mitigation:* graceful manual-fallback mode; user-visible error states.
- **MEDIUM — Personal motivation decay.** Solo project, ambitious scope. *Mitigation:* personal-tool-first slicing; ship something that helps the Power User in week 4, not month 12.
- **MEDIUM — Legal exposure.** Distributing a tool that facilitates grey-market drug ordering is novel territory. Probably not criminal (the user is doing the ordering), but novel. *Mitigation:* legal review before any public launch; harm-reduction framing throughout.
- **LOW — Competitive obsolescence.** PeptIQ adds ordering. *(Very unlikely — they're App-Store-bound. PeptPro has sourcing but via their own marketplace, not grey-market Telegram.)*
- **LOW (mitigated) — The grey market faces regulatory pressure.** FDA's 2026 actions against Category 2 peptides signal a legitimization trend that could reduce the grey-market-accessible compound list over time. *Mitigation:* The "bridge play" — supporting both grey-market Telegram/crypto AND compounding pharmacy/telehealth sourcing — means the product survives and adapts if the regulatory landscape shifts. Novel research peptides will continue emerging faster than FDA pathways can absorb them, preserving a grey-market audience indefinitely.

### Strategic technology bets (v2 horizon)
These are not v1 commitments but signal where differentiation compounds over time:
- **AI Telegram response parser:** AI reads vendor Telegram messages and auto-updates order status + inventory. More resilient than scripted bots; activates when v2 ordering ships.
- **Automated PubMed watch:** AI monitors new publications on compounds in the user's active stack. Flags new research so the user stays current without manual tab-monitoring.
- **Lab data import + protocol correlation:** Bloodwork import (InsideTracker, LabCorp, PDF OCR) overlaid with protocol timeline. Connects biomarker data to stack decisions — the feature PeptPro gestures at but locks to their own marketplace.

## 12. Open Questions

Questions marked **[PRD-blocking]** must be answered before writing user stories. **[Tech-stack]** can wait until the tech-stack step. **[Later]** do not block the PRD.

1. **[Later] What is the product called?** Working name "Project Peptides" is a placeholder. The name should reflect the honesty + power positioning, not be cute.
2. **[RESOLVED] Platform shape: web app.** Multi-tenant web application with user accounts. No App Store distribution. Decided: web-first.
3. **[Tech-stack] Database and sync approach.** Standard relational DB (likely PostgreSQL) with server-side auth. "Local-first" language is superseded — data lives in the server DB, privacy commitment is at the application layer.
4. **[PRD-blocking] Telegram automation scope (v1 vs. v2).** Decided directionally: v1 = guided manual (app composes the message, user sends it). Full bot automation = v2 stretch goal. Confirm in implementation-plan.
5. **[RESOLVED] Multi-user architecture.** Web app with distinct user accounts. Power User is super admin with management controls — can create users, configure their protocols, review their adherence. Each user logs in and sees only their own data. Resolved.
6. **[Later] Public reference site: Year 2 or never?** Depends on whether personal-tool adoption proves the model first.
7. **[Later] Community features: kept out entirely, or opt-in Year 2?** Anti-vision rejects engagement-platform dynamics; a curated low-noise community might be compatible. Not in v1.
8. **[PRD-blocking] Vendor sourcing scope: just QSC initially, or N vendors?** Pragmatically QSC-first for v1 ordering; architecture should allow adding vendors. Confirm in PRD.
9. **[PRD-blocking] Legal review trigger.** Before family adoption? Before any paid license? Define the line. Failure to decide creates ambiguity about what can ship.
10. **[Tech-stack] AI assistance scope.** Allowed uses defined in §8 Anti-Vision. Technical approach (vector search? OpenAI? local model?) deferred to tech-stack step.

---

*This vision is the North Star. When a feature request, scope question, or design decision arises, evaluate it against this document. If something here is wrong, the vision changes first — not the downstream artifact.*
