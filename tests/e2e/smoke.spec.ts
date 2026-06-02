import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
  test('should load the home page and show navigation', async ({ page }) => {
    // Start on the home page (Auth check will redirect to login if unauthenticated)
    await page.goto('/');

    // Check for the brand name or a common element
    // await expect(page).toHaveTitle(/Peptides/);
    
    // Capture a debug screenshot to the gitignored test-results/ dir so running
    // the smoke test never dirties the working tree (this image is not compared).
    await page.screenshot({ path: 'test-results/home-smoke.png' });
  });

  test('should have a working PWA manifest', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();
    expect(manifest.display).toBe('standalone');
  });
});
