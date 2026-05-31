import { test, expect } from '@playwright/test';

test('inspect tracker page layout and benefits timeline', async ({ page }) => {
  // Skip this exploratory test by default to avoid failing on unseeded or non-standard test environments
  test.skip(true, 'Exploratory layout test relies on pre-seeded test@example.com user account');

  console.log('Navigating to login...');
  await page.goto('/login');

  console.log('Logging in as test@example.com...');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard');
  console.log('Login successful, on dashboard.');

  console.log('Navigating to tracker page...');
  await page.goto('/tracker');
  await page.waitForTimeout(2000); // let page load and transitions settle

  console.log('--- Tracker Page HTML Contents ---');
  const bodyText = await page.innerText('body');
  console.log('Page body text content:\n', bodyText);
  
  const timelineExists = await page.locator('text=Expected Benefits Timeline').count();
  console.log(`Timeline header exists: ${timelineExists > 0}`);

  const mainHTML = await page.locator('main').innerHTML();
  console.log('Main element inner HTML:\n', mainHTML);
});
