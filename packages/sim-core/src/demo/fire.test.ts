import { describe, expect, it } from 'vitest';
import { runFireDemo } from './fire.js';

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
});
