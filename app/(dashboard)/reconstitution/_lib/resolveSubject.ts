/**
 * Resolves the authorized subject user whose inventory the reconstitution page renders.
 *
 * Identity-scoping (CLAUDE.md): the actor may only view another user's inventory when that
 * user is one of the actor's managed users. Any unauthorized or malformed request silently
 * falls back to the actor's own data — we NEVER render an unauthorized subject's vials.
 *
 * Pure function (no I/O) so the authorization decision is exhaustively unit-testable. The
 * caller is responsible for fetching `managedUserIds` (e.g. via `getManagedUserIds(actor)`).
 *
 * @param actorUserId      the signed-in user (session.user.id)
 * @param requestedSubject the raw `?subject=` search param (string | string[] | undefined)
 * @param managedUserIds   ids of users the actor manages (empty for non-power-users)
 */
export function resolveSubjectUserId(
  actorUserId: string,
  requestedSubject: string | string[] | undefined,
  managedUserIds: string[]
): string {
  if (typeof requestedSubject !== 'string') return actorUserId;
  if (requestedSubject === actorUserId) return actorUserId;
  if (managedUserIds.includes(requestedSubject)) return requestedSubject;
  return actorUserId;
}
