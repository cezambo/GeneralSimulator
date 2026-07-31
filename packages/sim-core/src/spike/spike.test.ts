import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSpike } from './index.js';

describe('Spike V0 — laço headless', () => {
  it('fecha 3 dias: pensamento → Validador → memória', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spike-v0-'));
    try {
      const r = await runSpike({ seed: 'spike-teste', days: 3, mode: 'hybrid', cassetteDir: dir });
      // 3 dias × 4 horários × 2 agentes
      expect(r.thoughts).toBe(24);
      // 3 noites × 2 agentes × (summary + appraisal) entram no lote
      expect(r.events.filter((e) => e.kind === 'nightly')).toHaveLength(6);
      expect(r.days).toBe(3);
      expect(r.finalPositions['ag_lia']).toBeDefined();
      expect(r.finalPositions['ag_rui']).toBeDefined();
      expect(r.fingerprint).toMatch(/^[a-f0-9]{16}$/);
      expect(r.llmCostUsd).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('replay produz fingerprint idêntico e custo zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spike-replay-'));
    try {
      const a = await runSpike({ seed: 'spike-replay', days: 3, mode: 'hybrid', cassetteDir: dir });
      expect(a.providerCalls).toBeGreaterThan(0);

      const b = await runSpike({ seed: 'spike-replay', days: 3, mode: 'replay', cassetteDir: dir });
      expect(b.fingerprint).toBe(a.fingerprint);
      expect(b.thoughts).toBe(a.thoughts);
      expect(b.memoriesAdded).toBe(a.memoriesAdded);
      expect(b.finalPositions).toEqual(a.finalPositions);
      expect(b.providerCalls).toBe(0);
      expect(b.llmCostUsd).toBe(0);
      expect(b.cassetteHits).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
