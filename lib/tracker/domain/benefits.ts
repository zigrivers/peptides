/**
 * Standardizes calculation of the elapsed week of a protocol cycle.
 * Handles UTC midnights to avoid timezone shifts and off-by-one bugs.
 * 
 * @param startDate The start date of the protocol.
 * @param now The current date to calculate against.
 * @returns 1-indexed week number (e.g. days 0-6 is Week 1), or 0 if in the future.
 */
export function calculateElapsedWeeks(startDate: Date, now: Date): number {
  const startUtc = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
  const diffMs = nowUtc - startUtc;
  if (diffMs < 0) {
    return 0; // Protocol has not started yet
  }
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1; // 1-indexed week
}
