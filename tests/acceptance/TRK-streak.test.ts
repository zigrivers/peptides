import { describe, it, expect } from 'vitest';
import { calculateStreak } from '@/lib/tracker/domain/streak';

describe('calculateStreak', () => {
  it('returns 0 when there are no logged dates', () => {
    const result = calculateStreak([]);
    expect(result).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      isCapped: false,
    });
  });

  it('calculates streak when user logged a dose today', () => {
    // Relative to 2026-05-24 UTC
    const relativeTo = new Date('2026-05-24T12:00:00Z');
    const logged = ['2026-05-24', '2026-05-23', '2026-05-22'];
    const result = calculateStreak(logged, relativeTo);
    expect(result).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      isCapped: false,
    });
  });

  it('calculates streak when user logged yesterday but not today yet', () => {
    const relativeTo = new Date('2026-05-24T12:00:00Z');
    const logged = ['2026-05-23', '2026-05-22', '2026-05-21'];
    const result = calculateStreak(logged, relativeTo);
    expect(result).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      isCapped: false,
    });
  });

  it('returns 0 current streak if there is a gap of more than 1 day from today', () => {
    const relativeTo = new Date('2026-05-24T12:00:00Z');
    const logged = ['2026-05-22', '2026-05-21', '2026-05-20'];
    const result = calculateStreak(logged, relativeTo);
    expect(result).toEqual({
      currentStreak: 0,
      longestStreak: 3,
      isCapped: false,
    });
  });

  it('calculates longest streak independently from current streak', () => {
    const relativeTo = new Date('2026-05-24T12:00:00Z');
    const logged = [
      '2026-05-24',
      '2026-05-23', // current streak: 2
      '2026-05-20',
      '2026-05-19',
      '2026-05-18',
      '2026-05-17', // past streak: 4
      '2026-05-15',
    ];
    const result = calculateStreak(logged, relativeTo);
    expect(result).toEqual({
      currentStreak: 2,
      longestStreak: 4,
      isCapped: false,
    });
  });

  it('enforces 365-day cap and flags isCapped correctly', () => {
    const relativeTo = new Date('2026-05-24T12:00:00Z');
    const logged: string[] = [];
    const date = new Date(Date.UTC(2026, 4, 24)); // 2026-05-24
    
    // Create 370 consecutive dates
    for (let i = 0; i < 370; i++) {
      const cur = new Date(date.getTime() - i * 86400000);
      logged.push(cur.toISOString().split('T')[0]);
    }

    const result = calculateStreak(logged, relativeTo);
    expect(result).toEqual({
      currentStreak: 365,
      longestStreak: 365,
      isCapped: true,
    });
  });
});
