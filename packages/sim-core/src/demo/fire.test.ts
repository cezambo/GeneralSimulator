import { describe, expect, it } from 'vitest';
import { createFireSession, runFireDemo } from './fire.js';
import { SPIKE_GRID } from '../spike/room.js';

describe('Demo de incêndio V1 (zero LLM)', () => {
  it('alastra, consome combustível e deixa resíduo', () => {
    const r = runFireDemo({ seed: 'fire-aceitacao', ticks: 100 });
    expect(r.llmCalls).toBe(0);
    // Mais de uma célula: propagação por vizinhança.
    expect(r.cellsEverBurned).toBeGreaterThan(1);
    expect(r.peakBurning).toBeGreaterThan(1);
    // Ao fim o fogo deve ter baixado (apagou ou virou resíduo).
    expect(r.finalBurning).toBeLessThan(r.peakBurning);
    // Pelo menos uma célula virou cinza/carvão/lascas.
    expect(r.residueCells).toBeGreaterThan(0);
  });

  it('é determinístico na mesma semente', () => {
    const a = runFireDemo({ seed: 'fire-det', ticks: 60 });
    const b = runFireDemo({ seed: 'fire-det', ticks: 60 });
    expect(a).toEqual(b);
  });

  it('parede inflamável consumida vira chão atravessável (escombro)', () => {
    const s = createFireSession({ seed: 'fire-rubble', ticks: 1 });
    // Parede de pinho no meio — o fogo a consome e o buraco abre.
    s.world.setType(SPIKE_GRID, 3, 3, 'wall');
    s.world.setMaterial(SPIKE_GRID, 3, 3, 'pinho');
    expect(s.world.blocksMovementAt(SPIKE_GRID, 3, 3)).toBe(true);

    const t = s.bridge.targetAt(SPIKE_GRID, 3, 3);
    t.integrity = 4;
    s.substrate.invoke('ignite', t, { simTime: s.clock.simTime, world: s.bridge }, { intensity: 90 });
    s.bridge.commit();

    for (let i = 0; i < 20; i += 1) s.tick();

    const cell = s.world.tileAt(SPIKE_GRID, 3, 3);
    expect(cell.type).toBe('floor');
    expect(['carvao', 'cinza', 'lascas']).toContain(cell.materialId);
    expect(s.world.blocksMovementAt(SPIKE_GRID, 3, 3)).toBe(false);
  });
});
