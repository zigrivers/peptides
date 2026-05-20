# Multi-Model Review Summary: API Contracts

## Models Used
- Claude CLI (local) — available
- Codex CLI — available
- Gemini CLI — timeout (Quota exhausted)

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | Missing core Tracker lifecycle (Protocols, Cycles) | Claude, Codex | High |
| 2 | P0 | Missing Reconstitution and Vial inventory contracts | Claude, Codex | High |
| 3 | P0 | Missing Ordering lifecycle (Vendors, Products, History) | Claude, Codex | High |
| 4 | P0 | Payment Safety Gate bypass (jump to PaymentSent) | Claude, Codex | High |
| 5 | P1 | Missing Auth lifecycle (Reset, Deletion, Export) | Claude, Codex | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 6 | P1 | Sync protocol missing typed envelopes (Skips, Edits) | Codex | High |
| 7 | P1 | Idempotency standards (Header name, format) missing | Codex | Medium |
| 8 | P1 | 422 error for non-blocking inventory warnings | Codex | High |

## Disagreements
- None significant. Codex provided extremely detailed tactical feedback on API DTO design and error semantics.

## Reconciliation Notes
- All P0 and P1 findings from Codex have been verified against the PRD and domain models and synthesized.
- The separation of the Payment Safety Gate into distinct "Confirm Total" and "Mark Paid" steps is a critical PRD compliance fix.
- The expansion of the Error Catalog is necessary for frontend error handling.
