/**
 * Feature flags read from the runtime environment.
 *
 * Conservative semantics: a flag is enabled ONLY when the env var equals the
 * exact string `"true"`. Anything else (unset, `"false"`, `"1"`, `"yes"`,
 * `"TRUE"`) leaves the flag OFF. This is deliberate for destructive switches
 * like `DISABLE_ORDERING` — opt-in must be unambiguous.
 *
 * Per ADR-015, `DISABLE_ORDERING` isolates the ordering bounded context for
 * regulatory compliance. When on, all `/ordering/*` routes, server actions,
 * cron jobs, and UI surfaces are inert; Tracker/Reference/Reconstitution/Admin
 * remain fully functional.
 */
export function isOrderingDisabled(): boolean {
  return process.env.DISABLE_ORDERING === 'true';
}

/**
 * Throws `ordering_disabled` if the ordering module is gated off. Used as the
 * first line of every server action under `app/actions/ordering/*` for
 * defense-in-depth (server actions are reachable via direct POST regardless
 * of UI/middleware state).
 */
export function assertOrderingEnabled(): void {
  if (isOrderingDisabled()) throw new Error('ordering_disabled');
}
