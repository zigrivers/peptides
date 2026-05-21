import { test, expect } from '@playwright/test';

/**
 * Story: US-AUT-01 — Onboarding Path
 * Full E2E tests require auth setup (test user + seeded DB); skipped
 * until the E2E auth fixture is added in the testing wave.
 */
test.describe('US-AUT-01: Onboarding Wizard', () => {
  test.skip(true, 'E2E auth fixture not yet available — full wizard tests run in the E2E wave');

  test('AC-1: Power User wizard shows 3-step guide (browse_catalog → create_protocol → telegram_setup)', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('list', { name: 'Setup progress' })).toBeVisible();
    await expect(page.getByText('Browse the Compound Catalog')).toBeVisible();
    // Step indicator: step 1 has aria-current="step"
    const stepItems = page.getByRole('list', { name: 'Setup progress' }).getByRole('listitem');
    await expect(stepItems.first()).toHaveAttribute('aria-current', 'step');
  });

  test('AC-1: Next button advances Power User through steps', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Create Your First Protocol')).toBeVisible();
  });

  test('AC-2: Managed User wizard shows 2-step guide (view_schedule → log_first_dose)', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await expect(page.getByText('View Your Schedule')).toBeVisible();
  });

  test('Dismiss routes to dashboard and shows Getting Started checklist', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('region', { name: 'Getting Started' })).toBeVisible();
  });

  test('Getting Started checklist is not visible when onboarding completed', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Getting Started' })).not.toBeVisible();
  });
});
