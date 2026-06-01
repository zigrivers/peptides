#!/usr/bin/env node
/**
 * Guardrail: this project intentionally does NOT use GitHub Actions.
 * CI runs locally via the .githooks/pre-push hook (see ADR-016 and
 * .claude/rules/no-github-actions.md). This check fails the build if any
 * workflow file reappears under .github/workflows/, so Actions can't creep
 * back in and silently start consuming Actions minutes again.
 *
 * Wired into `pnpm check`, so it runs in the pre-push gate and any manual
 * `pnpm check`.
 */
import { existsSync, readdirSync } from 'node:fs';

const dir = '.github/workflows';

if (existsSync(dir)) {
  const offending = readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f));
  if (offending.length > 0) {
    console.error('\n✖ GitHub Actions workflows are not allowed in this project.');
    console.error(`  Found: ${offending.map((f) => `${dir}/${f}`).join(', ')}`);
    console.error('  CI runs locally via the pre-push hook — see ADR-016 and');
    console.error('  .claude/rules/no-github-actions.md. Remove the workflow file(s) to proceed.\n');
    process.exit(1);
  }
}

console.log('✓ guard:no-actions — no GitHub Actions workflows present');
