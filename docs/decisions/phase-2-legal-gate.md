# Phase 2 Legal Gate — Self-Review (Task 4.5)

**Status:** **CONDITIONAL — BLOCKED for Phase 2 ship until item 3 (standalone data export) is remediated.** Items 1, 2, 4, 5, 6 PASS as of Task 1.6c.
**Reviewed by:** Power User (solo dev) — Ken Allred (<zigrivers@gmail.com>)
**Review date:** 2026-05-23
**Next review:** 2027-05-23 (annual cadence per PRD §7.5), OR earlier whenever a blocking item is remediated.
**Reference:** [`docs/plan.md` §7.5](../plan.md), [`docs/implementation-plan.md` Task 4.5](../implementation-plan.md), ADR-009 (audit immutability), ADR-014 (data portability), ADR-015 (ordering isolation).

> Per PRD §7.5: *"Before Phase 2 ships (managed users), the Power User conducts a structured self-review against this checklist. **Pass criteria — all six items must be satisfied before Phase 2 ships.**"*
>
> This document is the Phase 2 entry checkpoint. Phase 2 ships **only** when the table below is all `PASS`. The current self-review found two blocking gaps (items 1 and 3). Each gap names the follow-on task that resolves it. Re-review this document whenever a blocking item is remediated. Annual re-review on the date in **Next review** above regardless.

---

## Checklist

| # | Item (verbatim from PRD §7.5) | Status | Evidence / Remediation |
|---|------|--------|----------------------|
| 1 | Each managed user signs (or clicks-through) a written acknowledgment that the Power User is configuring their protocols and can view their adherence data. | **PASS** (as of Task 1.6c) | Task 1.6c shipped `/accept-invite` page + `acceptInvite` server action (`lib/auth/application/acceptInvite.ts`, `app/(auth)/accept-invite/page.tsx`, `app/actions/auth/accept-invite.ts`). Invitees land at `/accept-invite?token=...`, see the consent copy verbatim above the form, must tick an explicit acknowledgment checkbox, and on submit the action writes the `INVITE_ACCEPTED` audit event (with the new user as both actor and subject) atomically with the user-create and `Invite.acceptedAt` / `acceptedByUserId` updates inside a single `withAudit` transaction. 12-test acceptance suite at `tests/acceptance/AUT-accept-invite.test.ts`. **Out-of-band signed copies** (if a family member prefers paper): file at R2 `legal/acks/{userId}.pdf` with 7y retention. |
| 2 | No managed user is a minor; no managed user lacks legal capacity to consent. | **PASS** (Power User attestation) | Attested by the Power User: every invited managed user in the v1 family circle is an adult of sound mind. No automated age verification — relies on Power User knowing the invitees personally. Operational gate: Power User re-attests at each new invite by self-checking before sending. |
| 3 | The data-export and account-deletion flows in §5.6 + §5.7 are verified working end-to-end for managed users (a managed user can request their data and have their account deleted by the Power User on demand). | **CONDITIONAL — deletion PASS, standalone export BLOCKED** | <ul><li>**Deletion side: PASS.** Task 4.3 (PR #30) ships `requestManagedUserDeletion` with typed-email confirmation, exhaustive cascade-table export emailed to the Power User before any DB write, 48h delayed deletion via `AccountDeletionRequest`, atomic cancel, and the `processPendingDeletions` cron (`lib/admin/application/AdminService.ts`). 25-test acceptance suite at `tests/acceptance/ADM-admin.test.ts`.</li><li>**Standalone export side: BLOCKED.** The PRD wording is *"a managed user can request their data … on demand"*. The deletion-time export does not satisfy this on its own — it requires the Power User to schedule a deletion (and either commit to it or cancel within 48h). That is operational kludge, not an end-to-end user-facing request. **Remediation:** Task 6.2 (Async Data Export Pipeline, `docs/implementation-plan.md` line 261) ships the standalone request-export flow. Until 6.2 is merged, this item fails and Phase 2 should not ship.</li></ul> |
| 4 | The audit log (§5.7) records every admin action taken on a managed user's data, with the actor identity preserved. | **PASS** | `lib/audit/domain/AuditEvent.ts` enumerates every audit action; `lib/audit/application/withAudit.ts` wraps every Server Action mutation in a transaction that writes the mutation and the AuditEvent atomically (mutation aborts on audit-write failure). `actorUserId` and `subjectUserId` are stored as plain strings with no FK constraint per ADR-009 — they survive user deletion so historical attribution is permanent. Admin actions in production: `MANAGED_USER_DEACTIVATED`, `MANAGED_USER_DELETION_REQUESTED`, `MANAGED_USER_DELETION_CANCELLED`, `MANAGED_USER_DELETED`, `MANAGED_USER_PASSWORD_RESET_TRIGGERED`, `USER_INVITED`, `INVITE_RESENT`, `INVITE_ACCEPTED`. System-actor pattern (`actorUserId: 'SYSTEM'`) used for cron-driven deletions (`processPendingDeletions`) with `originalRequestor` recorded in metadata. |
| 5 | The product framing in marketing or recruitment communications to family/friends is honest (no claim of clinical oversight, professional advice, or HIPAA coverage). | **PASS** | No marketing communications exist for v1 — the product is invite-only via direct outreach. The README, dashboard copy, and invite email template all describe the app as a *peptide tracker and reference web app*, never as a clinical, medical, or HIPAA-compliant service. Power User attestation: any future onboarding/recruitment copy will go through the same self-review against this item before being sent. |
| 6 | The Power User has reviewed their state-of-residence law for any provisions that materially apply to storing third-party health-adjacent data outside a clinical relationship. | **PASS** (Power User attestation) | Reviewed by the Power User for state of residence. No statutes identified that materially apply to a personal-tool deployment storing health-adjacent data for a small family/friend circle outside a clinical relationship. Caveat: this is a non-attorney self-review per PRD §7.5; if a managed user's residence changes (e.g. moves to a jurisdiction with stricter data laws) or if scope expands beyond family/friends, this item must be re-reviewed (and optional attorney consultation undertaken per PRD §7.5). |

---

## Item 1 — Managed User Acknowledgment (PASS — Task 1.6c)

**Implementation:** Task 1.6c shipped the missing acceptance flow:

- `app/(auth)/accept-invite/page.tsx` — public server component reads `?token=`, SHA-256-hashes the raw token, looks up the `Invite` by `tokenHash`, validates `status === 'PENDING'` and `expiresAt > now()`, and renders the acceptance form. Invalid links (expired, revoked, already-used, not-found, missing-token) render a non-distinguishing "Invitation no longer valid" page.
- `app/(auth)/accept-invite/_components/AcceptInviteForm.tsx` — client form with name + password + confirm-password + an explicit acknowledgment checkbox (default unchecked). Submit is disabled until the checkbox is ticked, passwords match, and password meets the 8-character minimum.
- `app/actions/auth/accept-invite.ts` — server action wrapping `lib/auth/application/acceptInvite` (the domain function). Maps every domain error to a user-facing message; on success returns `{}` and the form navigates to `/login?email=<email>&accepted=1` for sign-in.
- `lib/auth/application/acceptInvite.ts` — the transaction: validate token, validate form, check email-not-taken, then `withAudit` wraps `user.create` + `invite.update(status=ACCEPTED, acceptedAt, acceptedByUserId)` and writes the `INVITE_ACCEPTED` audit event with the new user as actor + subject and the invite as `resourceId`.
- `middleware.ts` — `/accept-invite` added to `PUBLIC_ROUTES` so unauthenticated invitees can reach it without redirect-to-login.

**Acknowledgment copy** (rendered above the form):

> *"[Power User] configures your protocols and can view your adherence data. You can request a data export or account deletion at any time. Submitting this form confirms you agree to this arrangement."*

**Audit record:** every acceptance writes a permanent `INVITE_ACCEPTED` row to the AuditEvent table (`actorUserId = newUserId`, `subjectUserId = newUserId`, `resourceId = invite.id`, metadata includes `managedBy` and `email`). Per ADR-009, this row survives user deletion as the durable consent record.

**Out-of-band signed copies** (rare — only if a family member prefers paper): file at R2 `legal/acks/{userId}.pdf` (Cloudflare R2 bucket `peptides-acks-prod`), 7-year retention via R2 lifecycle rule.

---

## Item 3 — Standalone Data Export (CONDITIONAL)

**Current state:** The deletion-time export (Task 4.3 / PR #30) is comprehensive — it covers every user-owned cascade table with secret fields stripped — but it is gated behind a deletion action.

**Gap:** PRD §7.5 item 3 requires that *"a managed user can request their data … on demand"*. The deletion-export-plus-cancel workaround requires the Power User to schedule a deletion they don't intend to commit, which is operational kludge and burns a 48h window every time. A managed user cannot self-serve.

**Remediation (Task 6.2 — already on the implementation plan):** `docs/implementation-plan.md` line 261, *Async Data Export Pipeline (R2 + Resend)*. Once 6.2 ships, a managed user (or a Power User acting on their behalf) can trigger an export from the account-settings UI without scheduling a deletion. Until 6.2 is merged, item 3 conditionally passes the deletion-side but fails the standalone-export side, and Phase 2 entry is blocked.

---

## Items 2, 5, 6 — Power User Attestation

These items are not satisfied by code; they are satisfied by the Power User attesting honestly and re-attesting at each new invite. Operational gates:

1. **Re-attest items 2 and 6 at every new managed-user invite.** A change in the invitee's age, jurisdiction, or capacity to consent voids the prior attestation. Self-check before clicking **Send invite** in the admin UI.
2. **Marketing-copy review (item 5).** If any future marketing/recruitment copy is drafted (Phase 3 or beyond), run it through item 5 before publishing.

---

## Operational Gates (carried forward)

These are not blocking for Phase 2 entry directly, but must be maintained as the user base grows:

1. **R2 bucket `peptides-acks-prod` retention.** Lifecycle rule must be `delete after 7 years` (defense-in-depth; the Power User also keeps a local audit of acks). Verify annually as part of the next-review pass.
2. **Annual review.** The **Next review** date at the top of this document is a calendar reminder. The Power User adds it to their personal calendar and updates this document with a new section dated `YYYY-MM-DD` containing the same checklist.

---

## Phase 2 Ship Decision

**Phase 2 does NOT ship until item 3 is remediated.** Concretely:

- ✅ **Task 1.6c** (accept-invite + acknowledgment) — SHIPPED. Item 1 PASS.
- ❌ **Task 6.2** (Async Data Export Pipeline) — required for item 3.

When 6.2 ships, return to this document and update the table; once all six items show `PASS`, file an updated revision-history row stating Phase 2 entry granted.

---

## Revision history

| Date | Reviewer | Summary |
|------|----------|---------|
| 2026-05-23 | Power User | Initial review — items 2/4/5/6 PASS, items 1/3 BLOCKED. Phase 2 entry NOT yet granted; remediation requires Task 1.6c (accept-invite) and Task 6.2 (standalone export). |
| 2026-05-23 | Power User | Task 1.6c shipped — item 1 now PASS. Item 3 (standalone export) still BLOCKED on Task 6.2. Phase 2 entry remains gated. |
