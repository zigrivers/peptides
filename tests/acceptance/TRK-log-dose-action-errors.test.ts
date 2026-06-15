import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'user-1' } })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const logDoseMock = vi.fn();
vi.mock('@/lib/tracker/application/DoseLogService', () => ({ logDose: (i: unknown) => logDoseMock(i) }));

import { logDoseAction } from '@/app/actions/tracker/log-dose';

const base = {
  protocolId: '11111111-1111-1111-1111-111111111111',
  amount: { amount: '15', unit: 'IU' as const },
  status: 'LOGGED' as const,
  injectionSite: { bodyPart: 'thigh', side: 'right' as const },
  scheduledDate: '2026-06-15',
};

describe('logDoseAction error mapping', () => {
  beforeEach(() => logDoseMock.mockReset());

  it('maps a raw insufficient_inventory throw to a friendly message', async () => {
    logDoseMock.mockRejectedValueOnce(new Error('insufficient_inventory'));
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: false, error: 'insufficient_inventory' });
    expect(res.ok === false && res.message).not.toMatch(/insufficient_inventory/);
    expect(res.ok === false && res.message.length).toBeGreaterThan(0);
  });

  it('maps an unknown error to a friendly generic, not the raw message', async () => {
    logDoseMock.mockRejectedValueOnce(new Error('cannot read foo of undefined'));
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: false, error: 'unknown' });
    expect(res.ok === false && res.message).not.toMatch(/cannot read foo/);
  });

  it('returns warnings on success', async () => {
    logDoseMock.mockResolvedValueOnce({ doseLog: { id: 'd1' }, warnings: [{ code: 'insufficient_inventory', message: 'short' }] });
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: true });
    expect(res.ok === true && res.warnings?.[0]?.code).toBe('insufficient_inventory');
  });
});
