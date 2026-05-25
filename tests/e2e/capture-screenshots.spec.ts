import { test } from '@playwright/test';
import * as path from 'path';

test('capture screenshots of main pages', async ({ page }) => {
  const artifactDir = '/Users/kenallred/.gemini/antigravity-cli/brain/96079c80-70bc-4cbc-99fc-3d948e67b2e3';

  // Increase test timeout for taking multiple screenshots
  test.setTimeout(60000);

  console.log('Navigating to login page...');
  await page.goto('/login');

  console.log('Logging in...');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  // Wait for login redirection to dashboard
  await page.waitForURL('**/dashboard');
  console.log('Login successful! Navigated to dashboard.');

  // Wait for page transition animations to settle
  await page.waitForTimeout(2000);

  // 1. Dashboard screenshot
  await page.screenshot({ path: path.join(artifactDir, 'dashboard.png') });
  console.log('Dashboard screenshot saved.');

  // 2. Reconstitution screenshot
  console.log('Navigating to reconstitution page...');
  await page.goto('/reconstitution');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(artifactDir, 'reconstitution.png') });
  console.log('Reconstitution screenshot saved.');

  // 3. Settings screenshot
  console.log('Navigating to settings page...');
  await page.goto('/settings');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(artifactDir, 'settings.png') });
  console.log('Settings screenshot saved.');

  // 4. Ordering screenshot
  console.log('Navigating to ordering page...');
  await page.goto('/ordering');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(artifactDir, 'ordering.png') });
  console.log('Ordering screenshot saved.');
});
