import { describe, it } from 'vitest';

/**
 * Story: US-ADM-01 - Create Managed User
 */
describe('US-ADM-01: Create Managed User', () => {
  it.todo('AC-1: sends invite link valid for 72 hours', () => {
    // Hint: check lib/auth/domain/Invite
  });

  it.todo('AC-2: restricts managed user view to schedule only', () => {
    // Hint: assert 403 on /ordering for managed user role
  });
});

/**
 * Story: US-ADM-02 - Monitor Adherence
 */
describe('US-ADM-02: Monitor Adherence', () => {
  it.todo('AC-1: calculates 7-day adherence % per managed user', () => {
    // Hint: check adherence query logic in lib/tracker/infrastructure
  });
});
