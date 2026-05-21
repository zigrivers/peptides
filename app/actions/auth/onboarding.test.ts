import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockAdvanceOnboardingStep = vi.fn();
const mockDismissOnboarding = vi.fn();
const mockGetOnboardingState = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/auth/application/onboarding', () => ({
  advanceOnboardingStep: mockAdvanceOnboardingStep,
  dismissOnboarding: mockDismissOnboarding,
  getOnboardingState: mockGetOnboardingState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAdvanceOnboardingStep.mockResolvedValue(undefined);
  mockDismissOnboarding.mockResolvedValue(undefined);
  mockGetOnboardingState.mockResolvedValue({ step: 'browse_catalog', dismissed: false });
});

const { advanceOnboardingAction, dismissOnboardingAction, getOnboardingStateAction } =
  await import('@/app/actions/auth/onboarding');

/**
 * Story: US-AUT-01 — Onboarding Path (server action layer)
 * Validates auth, role-scoping, and delegation to application service.
 */
describe('US-AUT-01: advanceOnboardingAction', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await advanceOnboardingAction('browse_catalog');
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns validation_error for unknown step', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await advanceOnboardingAction('not_a_step');
    expect(result).toEqual({ ok: false, error: 'validation_error' });
  });

  it('AC-1: rejects MANAGED_USER attempting a POWER_USER-only step', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'MANAGED_USER' } });
    const result = await advanceOnboardingAction('browse_catalog');
    expect(result).toEqual({ ok: false, error: 'validation_error' });
  });

  it('AC-2: rejects POWER_USER attempting a MANAGED_USER-only step', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await advanceOnboardingAction('view_schedule');
    expect(result).toEqual({ ok: false, error: 'validation_error' });
  });

  it('AC-1: advances POWER_USER to create_protocol', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await advanceOnboardingAction('create_protocol');
    expect(result).toEqual({ ok: true });
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith('u-1', 'create_protocol');
  });

  it('AC-1: advances POWER_USER to telegram_setup', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await advanceOnboardingAction('telegram_setup');
    expect(result).toEqual({ ok: true });
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith('u-1', 'telegram_setup');
  });

  it('AC-1: POWER_USER can advance to completed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await advanceOnboardingAction('completed');
    expect(result).toEqual({ ok: true });
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith('u-1', 'completed');
  });

  it('AC-2: advances MANAGED_USER to log_first_dose', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'MANAGED_USER' } });
    const result = await advanceOnboardingAction('log_first_dose');
    expect(result).toEqual({ ok: true });
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith('u-1', 'log_first_dose');
  });

  it('AC-2: MANAGED_USER can advance to completed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'MANAGED_USER' } });
    const result = await advanceOnboardingAction('completed');
    expect(result).toEqual({ ok: true });
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith('u-1', 'completed');
  });
});

describe('US-AUT-01: dismissOnboardingAction', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await dismissOnboardingAction();
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('dismisses onboarding for authenticated POWER_USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await dismissOnboardingAction();
    expect(result).toEqual({ ok: true });
    expect(mockDismissOnboarding).toHaveBeenCalledWith('u-1');
  });

  it('dismisses onboarding for authenticated MANAGED_USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'MANAGED_USER' } });
    const result = await dismissOnboardingAction();
    expect(result).toEqual({ ok: true });
    expect(mockDismissOnboarding).toHaveBeenCalledWith('u-1');
  });
});

describe('US-AUT-01: getOnboardingStateAction', () => {
  it('returns null when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getOnboardingStateAction();
    expect(result).toBeNull();
  });

  it('returns onboarding state for authenticated user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', role: 'POWER_USER' } });
    const result = await getOnboardingStateAction();
    expect(result).toEqual({ step: 'browse_catalog', dismissed: false });
    expect(mockGetOnboardingState).toHaveBeenCalledWith('u-1');
  });
});
