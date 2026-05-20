# Multi-Model Review Summary: Automated Evals

## Models Used
- Claude CLI (local) — available
- Codex CLI — available
- Gemini CLI — timeout (Quota exhausted)

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P1 | Missing core eval categories (Cross-Doc, Adherence) | Claude, Codex | High |
| 2 | P1 | Missing all 8 conditional eval categories | Claude, Codex | High |
| 3 | P1 | Inconsistent package manager (npm vs pnpm) | Claude, Codex | High |
| 4 | P1 | Missing exclusion mechanism for false-positives | Claude, Codex | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 5 | P1 | Missing tech-stack-specific pattern checks (Next.js 15) | Codex | High |
| 6 | P1 | Missing API contract compliance checks | Codex | Medium |

## Disagreements
- None significant. Codex provided deeper insight into specific Next.js 15 and Prisma patterns to check.

## Reconciliation Notes
- All P1 findings from Codex have been verified and synthesized into the main review report.
- The switch to `pnpm` and the addition of a `make eval` (or `pnpm eval`) target are critical for CI readiness.
- The exclusion mechanism is necessary to prevent "warning fatigue" during the build phase.
