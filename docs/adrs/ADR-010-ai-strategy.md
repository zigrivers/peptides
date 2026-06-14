# ADR-010: AI Strategy and Provider Selection

## Status
Accepted

## Amendments
- **2026-06-01:** Added **DeepSeek (`deepseek-chat`) as a tertiary provider** in the
  fall-through chain (`Anthropic → Gemini → DeepSeek`). DeepSeek is the intended
  **primary** provider for the monthly catalog-refresh job (cost/throughput on batch
  research extraction); see `docs/catalog-platform-upgrade-plan.md` §5. Each provider key
  is optional — a provider with no key is skipped, not an error.

## Context
The PRD's Phase 3 features (`AI Telegram response parser`, `Automated PubMed watch`) and several supporting flows (compound profile drafting, citation extraction, peptide-profile generation for human review) require LLM calls. These are explicitly *bounded* AI uses per the vision's anti-vision rule: no personalized dose recommendations, no stack optimization, no safety clearance claims.

PRD Q10 was marked `[Tech-stack]` and deferred from the vision; this ADR resolves it.

## Decision
We will use **the Vercel AI SDK** as the AI client abstraction and **default to Anthropic Claude (`claude-sonnet-4-6` for high-quality drafting, `claude-haiku-4-5-20251001` for cost-sensitive batch jobs)** as the primary provider. **Gemini (`gemini-2.5-pro`) is the secondary provider**, selected when latency or cost requires it. **OpenAI is not in the v1 mix** to limit the provider-lock-in surface.

### Allowed AI uses (v1)
- **PubMed citation extraction** (background job, `claude-haiku-4-5-20251001`): parse a paper title + abstract → return structured `{title, authors, journal, year, doi, pmid}`. Run as a Railway cron job (per ADR-012).
- **Peptide profile drafting** (admin-only, `claude-sonnet-4-6`): generate a draft profile from a prompt + cited papers; **always reviewed and approved by the Power User before publish**. The draft never appears to other users until human approval lands.
- **(Phase 3) Telegram response parser** (background job, `claude-sonnet-4-6`): given a vendor's Telegram reply, extract `{confirmedTotal, currency, walletAddress, lineItems}`. Output is presented to the user on the payment confirmation screen — *the user is still the safety gate*; the AI is a convenience parser, not a payment executor.
- **(Phase 3) PubMed digest summarization** (background job, `claude-haiku-4-5-20251001`): summarize new papers on subscribed compounds into a weekly email digest. No protocol recommendations in the digest.

### Disallowed AI uses (v1 + always)
- Personalized dose recommendations of any kind.
- Stack optimization or interaction analysis.
- "Safety clearance" or "approved" language on any AI output.
- AI-generated compound profiles published without human review.
- AI-driven sourcing recommendations (which vendor to use; which compound to order).

### Provider failure handling
- All AI calls are wrapped with timeout (default 30s) + retry-once with backoff.
- Providers fall through in order `Anthropic → Gemini → DeepSeek`; a provider whose API key is unset is skipped. If Claude, Gemini, and DeepSeek all fail, the dependent feature degrades gracefully (e.g., PubMed digest skips that week; profile drafting falls back to manual entry).
- AI failures never block user-facing dose logging, ordering, or reconstitution flows.

### Prompt caching
- All Claude API calls use Anthropic's prompt caching (5-minute TTL) for the system prompt and any reused context. This is non-optional — it materially affects cost at v1 scale and the rule is repeated in implementation playbook.

## Alternatives Considered
- **OpenAI primary** (`gpt-4o` / `gpt-4.1`): Considered as the default. Rejected because the team's strongest evaluation and prompt-caching workflows are already invested in Claude, and the cost profile at v1 scale (~5 admin batch jobs/week) does not justify a second provider lock-in. Revisit at Phase 3 if Claude proves insufficient for the Telegram parser.
- **Self-hosted local model (Ollama + Llama 3.x)**: Eliminates per-call cost and removes a third-party dependency, but adds significant operational burden (GPU hosting, model updates, eval pipeline) that a solo developer cannot sustain in v1.
- **No AI at all in v1**: Defers all four allowed uses. Rejected because PubMed citation extraction is a non-trivial accuracy improvement over manual transcription, and the profile drafting workflow is a meaningful Power User time saver.

## Consequences
- **Benefits**: Single SDK surface (Vercel AI SDK) lets us switch providers without rewriting call sites. Caching dramatically reduces cost. Allowed-uses list is explicit and reviewable so AI scope creep can be caught in PR review.
- **Costs**: Up to three optional API keys (Anthropic primary, Google for Gemini fallback, DeepSeek tertiary) to manage. Vercel AI SDK is fast-moving — minor breaking changes between versions are expected. Adds a non-deterministic system component to the architecture; any feature using it requires evaluation harness coverage (see ADR-008 + tests/evals).

## Traces
- PRD §3.3 (Phase 3 features: AI Telegram parser, PubMed watch), §5.1 (AI-drafted profiles with human review), §12 Q10 (AI assistance scope — this ADR resolves it).
- Vision §8 Anti-Vision (allowed vs. disallowed AI uses — verbatim).
- ADR-012 (Railway Cron — runs the background AI jobs).
- ADR-013 (Sentry — captures AI call failures).

---

## Revision (2026-06-14)

**Source of truth:** `docs/superpowers/specs/2026-06-14-research-content-relaxation-design.md` §1, §6.

### Clarification: "approval/safety-clearance language" targets affirmative claims only

The disallowed AI uses entry — *"Safety clearance" or "approved" language on any AI output* —
is clarified to target **affirmative approval/clearance claims**. The AI **may** state the
**absence** of approval as a cautionary descriptive fact. Examples that are now permitted:

- "GHK-Cu is not FDA-approved"
- "there is no safety clearance for this compound"
- "remains investigational"
- "lacks FDA approval"

Examples that remain disallowed (affirmative claims):

- "GHK-Cu is FDA-approved"
- "FDA-approved for wound healing"
- "It is clinically approved"
- "This compound has safety clearance"

### Implementation: negation-aware `containsDisallowedPhrase`

The guard in `lib/ai/domain/schemas.ts` is split into two categories:

- **`ALWAYS_DISALLOWED`** — patterns that are disallowed unconditionally, regardless of
  surrounding context. Currently: `/\brecommended\s+dose\s+for\s+you\b/i` (personalized dose
  recommendation). Personalized recommendations ("recommended dose for you") remain
  **unconditionally disallowed** and are not affected by this revision.
- **`APPROVAL_CLAIM_PATTERNS`** — approval/clearance phrases that are disallowed **only when
  they appear as affirmative claims**. A new helper `isAffirmativeApprovalClaim(text)` checks
  a bounded preceding window (within the same clause) for a governing negation token. If a
  negation such as `not`, `no`, `never`, `lacks`, `without`, `absence of`, or `yet to be` is
  found within the window immediately before the match, the phrase is treated as a cautionary
  absence-of-approval statement and is permitted. A trailing negation ("FDA-approved, though
  not for this use") does **not** rescue an affirmative claim — only a preceding negation
  within the same clause governs the match. The bounded window also prevents a distant,
  unrelated negation ("this non-peptide compound is FDA-approved") from wrongly rescuing an
  affirmative claim.

`containsDisallowedPhrase(text)` returns `true` iff any always-disallowed pattern matches
**or** `isAffirmativeApprovalClaim(text)` is `true`.

### Callers

The guard has two callers:

1. **Compound research synthesis** (`lib/research/application/compoundResearch.ts`) — applied
   after each synthesis pass to `directAnswer`, every `evidence.point`, every `dosing.text`,
   and every `caveatsGaps` item.
2. **Admin profile drafting** (`lib/ai/application/draftCompoundProfile.ts`) — applied to
   AI-generated draft content before it is returned for human review.

Both callers benefit identically from the negation-aware guard. The relaxation only ever
permits a cautionary "not approved" statement; it never permits an affirmative approval claim,
so neither caller becomes less safe.
