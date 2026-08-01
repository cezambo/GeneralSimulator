import { describe, expect, it } from 'vitest';
import { describeTileLook } from './tile-look.js';

describe('describeTileLook', () => {
  it('distingue encharcado (alto) de húmido (baixo)', () => {
    const alto = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'wet', intensity: 85 }],
    });
    expect(alto).toBe('chão de pinho · encharcado');

    const medio = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'wet', intensity: 40 }],
    });
    expect(medio).toBe('chão de pinho · molhado');

    const baixo = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'wet', intensity: 15 }],
    });
    expect(baixo).toBe('chão de pinho · húmido');
  });

  it('ignora wet com intensidade zero (não inventa húmido)', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      temperature: 90,
      states: [{ type: 'wet', intensity: 0 }],
    });
    expect(look).toBe('chão de pinho · ainda quente');
    expect(look).not.toMatch(/húmido|molhado|encharcado|úmido/);
  });

  it('porta aberta e fechada', () => {
    expect(
      describeTileLook({
        type: 'door',
        materialId: 'madeira',
        state: { isOpen: true },
      }),
    ).toBe('porta de madeira (aberta)');

    expect(
      describeTileLook({
        type: 'door',
        materialId: 'madeira',
        state: { isOpen: false },
      }),
    ).toBe('porta de madeira (fechada)');

    expect(
      describeTileLook({
        type: 'door',
        materialId: 'ferro',
      }),
    ).toBe('porta de ferro (fechada)');
  });

  it('calor residual seco não afirma humidade', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      temperature: 400,
      states: [],
    });
    expect(look).toBe('chão de pinho · ainda ardente');
    expect(look).not.toMatch(/húmido|molhado|encharcado|úmido|wet/);
  });

  it('quente com humidade mantém calor actual + grau de wet', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      temperature: 90,
      states: [{ type: 'wet', intensity: 80 }],
    });
    expect(look).toBe('chão de pinho · quente · encharcado');
    expect(look).not.toContain('ainda');
  });

  it('ainda morno residual sem wet', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pedra',
      temperature: 35,
    });
    expect(look).toBe('chão de pedra · ainda morno');
  });

  it('composto: porta em chamas sem wet', () => {
    const look = describeTileLook({
      type: 'door',
      materialId: 'madeira',
      state: { isOpen: true },
      states: [{ type: 'burning', intensity: 90 }],
      temperature: 280,
    });
    expect(look).toBe('porta de madeira (aberta) · ainda ardente · em chamas');
  });

  it('distingue fumo denso (alto) de neblina (baixo)', () => {
    const alto = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'smoky', intensity: 85 }],
    });
    expect(alto).toBe('chão de pinho · fumo denso');

    const medio = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'smoky', intensity: 40 }],
    });
    expect(medio).toBe('chão de pinho · fumegante');

    const baixo = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      states: [{ type: 'smoky', intensity: 15 }],
    });
    expect(baixo).toBe('chão de pinho · neblina');
  });

  it('ignora smoky com intensidade zero', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      temperature: 90,
      states: [{ type: 'smoky', intensity: 0 }],
    });
    expect(look).toBe('chão de pinho · ainda quente');
    expect(look).not.toMatch(/neblina|fumegante|fumo denso|fumaça/);
  });

  it('smoky + wet + calor mantém prosa composta', () => {
    const look = describeTileLook({
      type: 'door',
      materialId: 'madeira',
      state: { isOpen: false },
      temperature: 90,
      states: [
        { type: 'wet', intensity: 80 },
        { type: 'smoky', intensity: 45 },
      ],
    });
    expect(look).toBe('porta de madeira (fechada) · quente · encharcado · fumegante');
  });
});
