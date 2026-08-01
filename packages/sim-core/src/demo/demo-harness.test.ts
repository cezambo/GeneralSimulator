/**
 * Cenários autónomos da demo via WebSocket (mesmo código do `npm run sim -- harness`).
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  HARNESS_SCENARIOS,
  writeHarnessReport,
  type ScenarioResult,
} from './ws-harness.js';

const results: ScenarioResult[] = [];
const startedAt = new Date().toISOString();

describe('demo WS harness', () => {
  for (const scenario of HARNESS_SCENARIOS) {
    it(
      scenario.name,
      async () => {
        try {
          const detail = await scenario.run();
          results.push({ name: scenario.name, ok: true, detail });
          expect(detail.length).toBeGreaterThan(0);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          results.push({ name: scenario.name, ok: false, detail });
          throw err;
        }
      },
      45000,
    );
  }
});

afterAll(() => {
  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  writeHarnessReport({
    ok: failed.length === 0 && results.length === HARNESS_SCENARIOS.length,
    failed,
    startedAt,
    scenarios: results,
  });
});
