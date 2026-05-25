/**
 * Calculations for logical UTC calendar streaks.
 */

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  isCapped: boolean;
}

/**
 * Calculates current and longest consecutive day streaks based on UTC date strings (YYYY-MM-DD).
 *
 * @param loggedDates Array of YYYY-MM-DD strings representing days with logged doses
 * @param relativeToDate Optional date to calculate relative to (defaults to UTC today)
 * @returns StreakResult
 */
export function calculateStreak(loggedDates: string[], relativeToDate?: Date): StreakResult {
  const dateSet = new Set(loggedDates);
  
  const referenceDate = relativeToDate || new Date();
  
  // Logical UTC Today
  const todayUTC = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const todayStr = todayUTC.toISOString().split('T')[0];
  
  // Logical UTC Yesterday
  const yesterdayUTC = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate() - 1));
  
  let currentStreak = 0;
  
  // Decide starting check date: today if logged, otherwise yesterday
  let checkDate = dateSet.has(todayStr) ? todayUTC : yesterdayUTC;
  
  // Walk back day by day to compute current streak
  while (true) {
    const checkStr = checkDate.toISOString().split('T')[0];
    if (dateSet.has(checkStr)) {
      currentStreak++;
      checkDate = new Date(Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate() - 1));
    } else {
      break;
    }
  }

  // Calculate longest streak in the window
  let longestStreak = 0;
  let tempStreak = 0;
  const sortedUniqueDates = Array.from(new Set(loggedDates)).sort();
  
  if (sortedUniqueDates.length > 0) {
    let prevDate: Date | null = null;
    for (const dateStr of sortedUniqueDates) {
      const curDate = new Date(dateStr + 'T00:00:00.000Z');
      if (prevDate === null) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(curDate.getTime() - prevDate.getTime());
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
      prevDate = curDate;
    }
  }

  // Cap at 365 days
  const isCapped = currentStreak >= 365 || longestStreak >= 365;
  
  return {
    currentStreak: Math.min(currentStreak, 365),
    longestStreak: Math.min(longestStreak, 365),
    isCapped,
  };
}
