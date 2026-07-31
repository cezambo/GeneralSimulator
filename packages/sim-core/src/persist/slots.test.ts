import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSlotName, loadSlot, saveSlot, slotExists } from './slots.js';

describe('persist/slots', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('salva e carrega texto idêntico', () => {
    dir = mkdtempSync(join(tmpdir(), 'sim-slots-'));
    const json = '{"saveVersion":1,"ok":true}';
    saveSlot(dir, 'demo', json);
    expect(slotExists(dir, 'demo')).toBe(true);
    expect(loadSlot(dir, 'demo')).toBe(json);
  });

  it('recusa nome de slot perigoso', () => {
    expect(() => assertSlotName('../x')).toThrow(/inválido/);
    expect(() => assertSlotName('a/b')).toThrow(/inválido/);
  });
});
