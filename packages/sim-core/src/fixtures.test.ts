import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_DIR, PROMPTS_DIR } from './config/paths.js';
import { loadRegistry } from './llm/registry.js';
import { validateDomain } from './schema/index.js';

const fixturesDir = join(CONFIG_DIR, 'fixtures');

describe('Fixtures dos dois agentes', () => {
  it('Lia e Rui validam contra o schema Agent', () => {
    for (const nome of ['agent_lia.json', 'agent_rui.json']) {
      const raw = JSON.parse(readFileSync(join(fixturesDir, nome), 'utf8'));
      const r = validateDomain('Agent', raw);
      expect(r.valid, `${nome}: ${r.message}`).toBe(true);
    }
  });

  it('os dois se referenciam nas relações', () => {
    const lia = JSON.parse(readFileSync(join(fixturesDir, 'agent_lia.json'), 'utf8'));
    const rui = JSON.parse(readFileSync(join(fixturesDir, 'agent_rui.json'), 'utf8'));
    expect(lia.relationships.some((r: { targetId: string }) => r.targetId === rui.id)).toBe(true);
    expect(rui.relationships.some((r: { targetId: string }) => r.targetId === lia.id)).toBe(true);
  });
});

describe('Prompts que estavam em falta', () => {
  it('nenhuma entrada do registry está marcada falta', () => {
    const reg = loadRegistry(true);
    const faltando = [...reg.entries()].filter(([, e]) => e.status === 'falta');
    expect(faltando.map(([id]) => id)).toEqual([]);
  });

  it('os seis prompts novos existem em disco', () => {
    const reg = loadRegistry(true);
    for (const id of [
      'agent.personality_drift',
      'cognition.self_understanding',
      'cognition.nightly_reflection',
      'cognition.whim_generation',
      'social.handshake',
      'social.relocation_vote',
    ]) {
      const e = reg.get(id);
      expect(e, id).toBeDefined();
      expect(e!.status).not.toBe('falta');
      expect(() => readFileSync(join(PROMPTS_DIR, e!.file), 'utf8')).not.toThrow();
    }
  });
});
