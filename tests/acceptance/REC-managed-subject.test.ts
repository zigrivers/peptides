import { describe, it, expect } from 'vitest';
import { resolveSubjectUserId } from '@/app/(dashboard)/reconstitution/_lib/resolveSubject';

describe('US-REC: managed-user (caregiver) subject resolution for inventory', () => {
  const ACTOR = 'actor-1';
  const MANAGED = 'managed-2';
  const STRANGER = 'stranger-9';

  describe('resolveSubjectUserId', () => {
    it('defaults to the actor when no subject param is provided', () => {
      expect(resolveSubjectUserId(ACTOR, undefined, [MANAGED])).toBe(ACTOR);
    });

    it('returns the actor when the requested subject equals the actor', () => {
      expect(resolveSubjectUserId(ACTOR, ACTOR, [MANAGED])).toBe(ACTOR);
    });

    it('returns the managed subject when the actor manages the requested subject', () => {
      expect(resolveSubjectUserId(ACTOR, MANAGED, [MANAGED])).toBe(MANAGED);
    });

    it('falls back to the actor when the actor does NOT manage the requested subject (no leak)', () => {
      expect(resolveSubjectUserId(ACTOR, STRANGER, [MANAGED])).toBe(ACTOR);
    });

    it('falls back to the actor when the managed list is empty', () => {
      expect(resolveSubjectUserId(ACTOR, MANAGED, [])).toBe(ACTOR);
    });

    it('ignores a non-string (array) subject param and returns the actor', () => {
      expect(resolveSubjectUserId(ACTOR, ['a', 'b'], [MANAGED])).toBe(ACTOR);
    });
  });
});
