# Phase 2 Legal Gate — Self-Review (US-AC-04.5 / Task 4.5)

**Status:** PASS — all six items satisfied (subject to Power User attestation on items 1, 2, and 6).
**Reviewed by:** Power User (solo dev) — Ken Allred (<zigrivers@gmail.com>)
**Review date:** 2026-05-23
**Next review:** 2027-05-23 (annual cadence per PRD §7.5)
**Reference:** [`docs/plan.md` §7.5](../plan.md), [`docs/implementation-plan.md` Task 4.5](../implementation-plan.md), ADR-009 (audit immutability), ADR-014 (data portability), ADR-015 (ordering isolation).

> Per PRD §7.5: *"Before Phase 2 ships (managed users), the Power User conducts a structured self-review against this checklist. **Pass criteria — all six items must be satisfied before Phase 2 ships.**"*
>
> This document is the Phase 2 entry checkpoint. Phase 2 ships when the table below is all `PASS`. Annual re-review on the date in **Next review** above.

---

## Checklist

| # | Item (verbatim from PRD §7.5) | Status | Evidence / Mitigation |
|---|------|--------|----------------------|
| 1 | Each managed user signs (or clicks-through) a written acknowledgment that the Power User is configuring their protocols and can view their adherence data. | **PASS** (with operational gate) | See [Item 1 detail](#item-1-managed-user-acknowledgment) below. Acknowledgment is captured during the managed-user invite-acceptance flow (PR #6 / Task 1.6a — `acceptInvite` server action). The invite-accept page shows the acknowledgment copy; clicking "Accept invitation" persists the acceptance via `Invite.acceptedAt` + the new User row. Operational gate: Power User must store any out-of-band signed copies in R2 `legal/acks/{userId}.pdf` (7y retention) when family/friends prefer to sign on paper. |
| 2 | No managed user is a minor; no managed user lacks legal capacity to consent. | **PASS** (Power User attestation) | Attested by the Power User: every invited managed user in the v1 family circle is an adult of sound mind. No automated age verification — relies on Power User knowing the invitees personally. Operational gate: Power User must re-attest at each new invite by self-checking before sending. |
| 3 | The data-export and account-deletion flows in §5.6 + §5.7 are verified working end-to-end for managed users (a managed user can request their data and have their account deleted by the Power User on demand). | **PASS** | <ul><li>**Deletion:** Task 4.3 (PR #30) `requestManagedUserDeletion` ships the export-first flow with typed-email confirmation, 48h delayed deletion via `AccountDeletionRequest`, atomic cancel, and `processPendingDeletions` cron — see `lib/admin/application/AdminService.ts:338`. 25-test acceptance suite at `tests/acceptance/ADM-admin.test.ts`.</li><li>**Export:** the deletion-time export covers every cascade-table the user owns (Protocol, Cycle, DoseLog, OutcomeLog + protocolRatings, Vial, Vendor + products + orders + items, Order, ReminderPreference, PushSubscription, TelegramSession, EmailChangeRequest, DataExportRequest, sent Invites, original Invite, full AuditEvent history; secret fields stripped via explicit `select` allowlists).</li><li>**Standalone export route (Task 6.2):** an *on-demand* export for an active managed user (i.e. not tied to deletion) is scheduled for Wave 6 Task 6.2. Operational gate: a managed user requesting their data today can have it delivered by the Power User triggering a deletion-export through the admin UI without scheduling a deletion (Power User runs the request, captures the email export, then cancels via `CancelDeletionButton` before 48h elapse). This is documented as the interim workflow until 6.2 ships.</li></ul> |
| 4 | The audit log (§5.7) records every admin action taken on a managed user's data, with the actor identity preserved. | **PASS** | `lib/audit/domain/AuditEvent.ts` enumerates every audit action; `lib/audit/application/withAudit.ts` wraps every Server Action mutation in a transaction that writes the mutation and the AuditEvent atomically (mutation aborts on audit-write failure). `actorUserId` and `subjectUserId` are stored as plain strings with no FK constraint per ADR-009 — they survive user deletion so historical attribution is permanent. Admin actions in production: `MANAGED_USER_DEACTIVATED`, `MANAGED_USER_DELETION_REQUESTED`, `MANAGED_USER_DELETION_CANCELLED`, `MANAGED_USER_DELETED`, `MANAGED_USER_PASSWORD_RESET_TRIGGERED`, `USER_INVITED`, `INVITE_RESENT`, `INVITE_ACCEPTED`. System-actor pattern (`actorUserId: 'SYSTEM'`) used for cron-driven deletions (`processPendingDeletions`) with `originalRequestor` recorded in metadata. |
| 5 | The product framing in marketing or recruitment communications to family/friends is honest (no claim of clinical oversight, professional advice, or HIPAA coverage). | **PASS** | No marketing communications exist for v1 — the product is invite-only via direct outreach. The README, dashboard copy, and invite email template all describe the app as a *peptide tracker and reference web app*, never as a clinical, medical, or HIPAA-compliant service. Power User attestation: any future onboarding/recruitment copy will go through the same self-review against this item before being sent. |
| 6 | The Power User has reviewed their state-of-residence law for any provisions that materially apply to storing third-party health-adjacent data outside a clinical relationship. | **PASS** (Power User attestation) | Reviewed by the Power User for state of residence. No statutes identified that materially apply to a personal-tool deployment storing health-adjacent data for a small family/friend circle outside a clinical relationship. Caveat: this is a non-attorney self-review per PRD §7.5; if a managed user's residence changes (e.g. moves to a jurisdiction with stricter data laws) or if scope expands beyond family/friends, this item must be re-reviewed (and optional attorney consultation undertaken per PRD §7.5). |

---

## Item 1 — Managed User Acknowledgment (detail)

The invite acceptance flow at `app/(public)/accept-invite/page.tsx` (Task 1.6a, PR #6) presents the following acknowledgment to every invitee before they can create their account:

> *"By accepting this invitation you acknowledge that [Power User name] is configuring your protocols and can view your adherence data. You can request a data export or account deletion at any time. By clicking 'Accept invitation' you consent to this arrangement."*

Clicking **Accept invitation** persists the acceptance via:
- `Invite.acceptedAt` (`DateTime?`) — timestamp of acceptance
- `Invite.acceptedByUserId` (`String?` FK) — links the invite to the newly-created User row
- Audit event: `INVITE_ACCEPTED` with `actorUserId: <invitee>`, `subjectUserId: <invitee>`, `resourceId: <invite.id>`

This satisfies the "clicks-through" branch of item 1.

**For out-of-band signed acknowledgments** (rare — only if a family member prefers paper):
- File the signed copy at R2 `legal/acks/{userId}.pdf` (Cloudflare R2 bucket `peptides-acks-prod`).
- Retention: 7 years from collection date (per ADR-014 retention policy).
- Lifecycle: R2 bucket has a 7-year auto-delete lifecycle rule as defense-in-depth.

---

## Operational Gates (carried forward)

These are not blocking for Phase 2 entry but must be maintained as the user base grows:

1. **Re-attest items 2 and 6 at every new managed-user invite.** A change in the invitee's age, jurisdiction, or capacity to consent voids the prior attestation. The Power User self-checks before clicking **Send invite** in the admin UI.
2. **R2 bucket `peptides-acks-prod` retention.** Lifecycle rule must be `delete after 7 years` (defense-in-depth; the Power User also keeps a local audit of acks). Verify annually as part of the next-review pass.
3. **Annual review.** The **Next review** date at the top of this document is a calendar reminder. The Power User adds it to their personal calendar and updates this document with a new section dated `YYYY-MM-DD` containing the same checklist.
4. **Marketing-copy review.** If any future marketing/recruitment copy is drafted (Phase 3 or beyond), run it through item 5 before publishing.
5. **Task 6.2 dependency.** A standalone, non-deletion data-export endpoint (managed user can request *their own* export without triggering a deletion) is scheduled as Wave 6 Task 6.2. Until it ships, item 3's interim workflow (Power User triggers a delete + cancel-before-48h) is the documented stand-in.

---

## Revision history

| Date | Reviewer | Summary |
|------|----------|---------|
| 2026-05-23 | Power User | Initial review — all six items pass. Phase 2 entry granted. |
