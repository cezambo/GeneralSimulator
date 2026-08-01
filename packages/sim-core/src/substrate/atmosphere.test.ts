import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATMOSPHERE,
  consumeOxygenOnBurn,
  effectiveOxygen,
  modulateBurnIntensity,
  oxygenFactor,
  recoverOxygen,
} from './atmosphere.js';
import type { ReactiveTarget } from './target.js';

function tile(over: Partial<ReactiveTarget> = {}): ReactiveTarget {
  return {
    id: 't',
    kind: 'tile',
    materialId: 'madeira',
    states: [],
    ...over,
  };
}

describe('atmosphere V1 (oxigênio / fumaça)', () => {
  it('ausente = ambiente; smoky deriva O₂ reduzido (correlação parcial)', () => {
    expect(effectiveOxygen(tile(), 100)).toBe(100);
    expect(
      effectiveOxygen(tile({ states: [{ type: 'smoky', intensity: 40 }] }), 100),
    ).toBe(86);
    expect(effectiveOxygen(tile({ oxygen: 25, states: [{ type: 'smoky', intensity: 90 }] }), 100)).toBe(
      25,
    );
  });

  it('oxygenFactor cai abaixo do limiar de enfraquecimento', () => {
    expect(oxygenFactor(100, 100, 50)).toBe(1);
    // No limiar: escala pelo ambiente (50/100).
    expect(oxygenFactor(50, 100, 50)).toBe(0.5);
    // Abaixo: escala pelo limiar (25/50).
    expect(oxygenFactor(25, 100, 50)).toBe(0.5);
    expect(oxygenFactor(10, 100, 50)).toBe(0.2);
    expect(oxygenFactor(0, 100, 50)).toBe(0);
  });

  it('consumo materializa oxygen e emite smoky', () => {
    const t = tile({ states: [{ type: 'burning', intensity: 100 }] });
    const { consumed, oxygenAfter } = consumeOxygenOnBurn(t, 100, DEFAULT_ATMOSPHERE);
    expect(consumed).toBeGreaterThan(0);
    expect(oxygenAfter).toBeLessThan(100);
    expect(t.oxygen).toBe(oxygenAfter);
    expect(t.states.some((s) => s.type === 'smoky')).toBe(true);
  });

  it('modulateBurnIntensity cresce com O₂ alto e pede extinguish com O₂ crítico', () => {
    const rico = tile({
      states: [{ type: 'burning', intensity: 40 }],
      oxygen: 100,
    });
    expect(modulateBurnIntensity(rico, DEFAULT_ATMOSPHERE)).toBe('changed');
    expect(rico.states[0]!.intensity).toBeGreaterThan(40);

    const critico = tile({
      states: [{ type: 'burning', intensity: 40 }],
      oxygen: 5,
    });
    expect(modulateBurnIntensity(critico, DEFAULT_ATMOSPHERE)).toBe('extinguish');
  });

  it('recoverOxygen sobe até o ambiente e some (esparso)', () => {
    const t = tile({ oxygen: 90 });
    expect(recoverOxygen(t, DEFAULT_ATMOSPHERE)).toBe(true);
    expect(t.oxygen).toBeGreaterThan(90);
    // Vários ticks até apagar o campo.
    for (let i = 0; i < 20; i++) recoverOxygen(t, DEFAULT_ATMOSPHERE);
    expect(t.oxygen).toBeUndefined();
  });
});
