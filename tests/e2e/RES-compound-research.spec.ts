/**
 * E2E happy-path spec for the compound-research feature.
 *
 * WHY THIS IS SKIPPED (ADR-017)
 * ─────────────────────────────
 * The compound-research feature is gated behind TWO conditions that cannot be
 * satisfied in a standard Playwright run without a real local stack:
 *
 * 1. AUTHENTICATION — This project has no e2e auth fixture yet (no globalSetup,
 *    no storageState, no sign-in helper). Every existing spec that needs auth
 *    (onboarding.spec.ts, test-tracker.spec.ts) is itself skipped for the same
 *    reason. Without auth, the compound detail page redirects to /login and
 *    the panel never mounts.
 *
 * 2. ENABLE GATE (ADR-017) — listCompoundResearchAction runs as a Next.js
 *    server action on every mount of CompoundResearchPanel. It calls
 *    isLocalResearchEnabled(), which reads the LOCAL_LLM_BASE_URL
 *    environment variable on the server. When that variable is unset (the
 *    default in CI / developer machines without a local LLM), enabled is
 *    false and the panel renders "Research assistant is unavailable right
 *    now." — the question input is never shown.
 *
 *    Server actions are NOT interceptable via page.route() because they
 *    are server-side POST requests handled inside the Next.js process, not
 *    separate HTTP calls the browser makes that Playwright can stub. So even
 *    if we stubbed the streaming Route Handler (/api/reference/star/research),
 *    the panel would still be in the disabled state.
 *
 * COVERAGE STATUS
 * ───────────────
 * The feature is fully covered by:
 *   - Unit / acceptance tests in tests/acceptance/RES-*.test.ts (all layers)
 *   - Route handler test in tests/acceptance/RES-research-route.test.ts
 *   - Save/delete/list action tests in tests/acceptance/RES-save-action.test.ts
 *   - Note service tests in tests/acceptance/RES-note-service.test.ts
 *
 * HOW TO UN-SKIP
 * ──────────────
 * 1. Add a globalSetup / storageState auth fixture (sign in as TEST_USER_ID,
 *    save cookies/storage to playwright/.auth/user.json, reference it in
 *    playwright.config.ts via use.storageState).
 * 2. Seed the test DB with a known CatalogItem (slug: 'bpc-157') and ensure
 *    LOCAL_LLM_BASE_URL is set (or inject it via a Next.js middleware that
 *    reads a test-only env override so the server action returns enabled: true).
 * 3. Remove the test.skip() wrapper below and fill in the user/password
 *    constants.
 */

import { test, expect } from '@playwright/test';

// ─── Constants (fill in when un-skipping) ────────────────────────────────────
// const TEST_EMAIL = 'test@example.com';
// const TEST_PASSWORD = 'Password123!';
// BPC-157 slug from seed.ts: nameToSlug('BPC-157') → 'bpc-157'
const COMPOUND_SLUG = 'bpc-157';

// NDJSON stub for the streaming run endpoint
const STUB_NDJSON = [
  JSON.stringify({ phase: 'planning' }),
  JSON.stringify({ phase: 'searching', queries: ['bpc-157 tendon healing'] }),
  JSON.stringify({ phase: 'synthesizing' }),
  JSON.stringify({
    phase: 'result',
    result: {
      summary: 'BPC-157 may support tendon healing.',
      findings: [
        {
          id: 'f0',
          claim: 'Accelerated tendon healing in rats.',
          sourceUrls: ['https://example.com/study'],
        },
      ],
      sourcesUsed: [{ title: 'Study', url: 'https://example.com/study' }],
    },
  }),
].join('\n') + '\n';

test.describe('RES: Compound Research happy path', () => {
  test.skip(
    true,
    [
      'Requires (1) e2e auth fixture (no globalSetup/storageState yet — see onboarding.spec.ts),',
      'and (2) COMPOUND_RESEARCH_ENABLED local stack (LOCAL_LLM_BASE_URL server-side env;',
      'server actions are not stubbable via page.route — ADR-017).',
      'Feature is covered by unit + route tests in tests/acceptance/RES-*.test.ts.',
    ].join(' ')
  );

  test('happy path: ask a question, view streamed result, save a finding', async ({ page }) => {
    // ── Step 1: Authenticate ──────────────────────────────────────────────────
    // Replace with storageState once the auth fixture exists.
    // await page.goto('/login');
    // await page.fill('input[name="email"]', TEST_EMAIL);
    // await page.fill('input[name="password"]', TEST_PASSWORD);
    // await page.click('button[type="submit"]');
    // await page.waitForURL('**/dashboard');

    // ── Step 2: Stub the streaming run endpoint ───────────────────────────────
    // The Route Handler at /api/reference/[catalogItemId]/research is a normal
    // HTTP endpoint and IS stubbable via page.route. The server action
    // (listCompoundResearchAction) is NOT — so this stub only matters once the
    // enable gate is bypassed in the test env.
    await page.route('**/api/reference/*/research', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: STUB_NDJSON,
      });
    });

    // ── Step 3: Navigate to the BPC-157 compound detail page ─────────────────
    await page.goto(`/reference/${COMPOUND_SLUG}`);

    // ── Step 4: Confirm the research panel is visible and enabled ─────────────
    // The panel heading always renders; the input only appears when enabled===true.
    const panel = page.getByRole('region').filter({ hasText: /Ask about/i });
    await expect(panel).toBeVisible();

    const questionInput = panel.getByPlaceholder(/tendon healing/i);
    await expect(questionInput).toBeVisible();

    // ── Step 5: Type a question and click Ask ─────────────────────────────────
    await questionInput.fill('What does research say about tendon healing?');
    await panel.getByRole('button', { name: 'Ask' }).click();

    // ── Step 6: Assert streamed result renders ────────────────────────────────
    await expect(panel.getByText('BPC-157 may support tendon healing.')).toBeVisible();
    await expect(panel.getByText('Accelerated tendon healing in rats.')).toBeVisible();

    // ── Step 7: Check the finding checkbox ───────────────────────────────────
    const findingCheckbox = panel.getByRole('checkbox').first();
    await findingCheckbox.check();
    await expect(findingCheckbox).toBeChecked();

    // ── Step 8: Save selected findings ───────────────────────────────────────
    await panel.getByRole('button', { name: 'Save selected findings' }).click();

    // ── Step 9: Assert the finding appears under "Your saved research" ────────
    const savedSection = panel.getByText('Your saved research');
    await expect(savedSection).toBeVisible();
    await expect(panel.getByText('Accelerated tendon healing in rats.')).toBeVisible();
  });

  // afterAll cleanup — remove any CompoundResearchNote rows the test user created.
  // Follows the repo's convention: prisma call scoped to test user id.
  // Uncomment once TEST_USER_ID is wired in via a fixture or env var.
  //
  // afterAll(async () => {
  //   const { prisma } = await import('@/lib/shared/prisma');
  //   await prisma.compoundResearchNote.deleteMany({
  //     where: { userId: process.env.E2E_TEST_USER_ID },
  //   });
  // });
});
