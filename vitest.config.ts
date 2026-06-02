import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Only the safety-critical domains are hard-gated (safety-math.md / testing.md).
      // `all` so untested files in these dirs surface (don't silently pass the gate).
      all: true,
      include: ['lib/reconstitution/**', 'lib/audit/**'],
      exclude: [
        '**/index.ts', // barrel re-exports, no logic
        'lib/reconstitution/domain/audioSynth.ts', // Web Audio API — not unit-testable in jsdom
      ],
      thresholds: {
        // Hard-gate the pure dosing-math domain and the audit-write layer at 100%
        // (safety-math.md / testing.md). These are achievable and stay there.
        'lib/reconstitution/domain/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'lib/audit/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        // DB-touching reconstitution services have PRE-EXISTING uncovered branches
        // (InventoryService/VialExpiry/VialService error paths) unrelated to this work.
        // Floor at current levels as a non-regression gate; ratchet toward 100% as
        // a follow-up (see docs/architecture/dose-units-followups-plan.md).
        'lib/reconstitution/application/**': { branches: 80, functions: 90, lines: 90, statements: 90 },
      },
    },
  },
});
