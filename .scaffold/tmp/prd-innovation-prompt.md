You are a senior product manager performing a feature-level innovation pass on a PRD for a peptide tracking web app.

GOAL: Surface new feature opportunities — things missing from the PRD, competitive differentiators, or gaps that would cause user abandonment. Focus on feature-level (new capabilities, new user flows), NOT UX polish of existing features.

OUTPUT: JSON with this structure:
{
  "model": "codex",
  "innovations": [
    {
      "id": "I-XX",
      "title": "Short title",
      "category": "safety|ux|ai-native|competitive|defensive",
      "problem": "What gap does this solve, for which user?",
      "behavior": "What does the feature do? Expected behavior change.",
      "cost": "trivial|moderate|significant",
      "impact": "nice-to-have|noticeable|differentiator",
      "recommendation": "must-have-v1|should-have|backlog|reject"
    }
  ]
}

## APP SUMMARY

**Product:** Peptide tracker + Telegram-automated ordering web app
**Users:** Power User (self-directed biohacker, also super admin) + Delegated Participants (family/friends on managed protocols)
**Phase 1 (M0-M3):** Auth + reference catalog + protocol/dose logging + reconstitution calc + Telegram MTProto ordering
**Phase 2 (M3-M6):** Multi-user admin + injection site rotation + cycle management + outcome logging + dashboard
**Phase 3 (M6-M12):** Protocol history + analytics + data export + AI Telegram parser + PubMed watch

## CURRENT FEATURE SET (v1)

**Reference:** ~20-30 peptide profiles with citations, PubMed links, dosing ranges, reconstitution guidance. Search by name/category.

**Tracker:**
- Protocol creation (compound + dose + frequency + start date)
- Daily dose logging with injection site suggestion
- Injection site rotation (round-robin, 8 sites)
- Cycle management (start/end, scheduled breaks, status)
- Subjective outcome logging (1-5 rating, per-protocol rating, tags, 1000-char note)
- Vial inventory (reconstitution events, estimated doses remaining)
- Stack overview dashboard

**Reconstitution Calculator:** BAC water + concentration + syringe units, safety guardrails, vial record creation

**Ordering:**
- Vendor catalog (manual entry from QSC PDF)
- Order builder → cart → Telegram message → MTProto auto-send
- Manual fallback (copy/paste + deep-link) always available
- Order tracking: Draft→Sent→Confirmed→Payment Sent→Received|Cancelled; Stale at 14 days
- Payment checklist: wallet address + amount visible before marking sent
- Inventory update on delivery

**Multi-user:** Super admin creates managed users via email invite (72h expiry). Managed users: dose logging only, no ordering.

**Auth:** Email/password, 30-day rolling session, password reset, account deletion with JSON export.

## WHAT IS ALREADY OUT OF SCOPE (do not suggest these)
- AI dose recommendations
- Community features
- App Store / native apps
- Automated crypto payment execution
- Lab data / bloodwork import
- Multi-vendor ordering (QSC only in v1)
- MFA/TOTP (already in Could Have)
- Dark mode (already in Could Have)

## KEY USER WORKFLOWS TO ANALYZE FOR GAPS

1. **7am dose routine:** Wake up → open app → log all doses in < 60 seconds
2. **Order flow:** Need compounds → build order → Telegram → pay → inventory updates
3. **Protocol setup:** Research compound → create protocol → set doses → link to cycle
4. **Reconstitution:** New vial → calculate concentration → record
5. **Managed user onboarding:** Admin creates account → sends invite → user accepts → admin configures protocols

## COMPETITORS
- PeptIQ, Smart Peptide Tracker, SHOTLOG, Titer, Peptify (App-Store-bound trackers — can't do grey-market ordering)
- PeptPro (web, own marketplace, not grey-market Telegram)
- No competitor closes order → inventory → dose → outcome loop

Focus on what would make a user say "I can't believe this isn't in v1" — not wishlist features.
