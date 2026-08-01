/**
 * Janela fechada isola aresta de vizinhança: fogo não salta para o outro lado.
 * Janela aberta acopla de novo (propagação A → janela → B). Alinhado a DF / W-004.
 */
import { describe, expect, it } from 'vitest';
import { createFireSession, type FireSession } from './fire.js';
import { SPIKE_GRID } from '../spike/room.js';

function isBurning(s: FireSession, x: number, y: number): boolean {
  return Boolean(
    s.sim.overlayAt(SPIKE_GRID, x, y)?.states?.some((st) => st.type === 'burning' && st.intensity > 0),
  );
}

/** Corredor 1-cell: parede / A / janela / B / parede — sem caminho à volta. */
function buildWindowCorridor(
  s: FireSession,
  windowOpen: boolean,
): { a: { x: number; y: number }; b: { x: number; y: number }; win: { x: number; y: number } } {
  const a = { x: 2, y: 2 };
  const win = { x: 3, y: 2 };
  const b = { x: 4, y: 2 };

  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      s.world.setType(SPIKE_GRID, x, y, 'wall');
      s.world.setMaterial(SPIKE_GRID, x, y, 'pedra');
    }
  }

  for (const cell of [a, b]) {
    s.world.setType(SPIKE_GRID, cell.x, cell.y, 'floor');
    s.world.setMaterial(SPIKE_GRID, cell.x, cell.y, 'pinho');
  }

  s.world.setType(SPIKE_GRID, win.x, win.y, 'window');
  s.world.setMaterial(SPIKE_GRID, win.x, win.y, 'pinho');
  s.world.setStructural(SPIKE_GRID, win.x, win.y, { isOpen: windowOpen });

  return { a, b, win };
}

describe('Janela e propagação de fogo', () => {
  it('janela fechada bloqueia fire-spread para o outro lado', () => {
    const s = createFireSession({ seed: 'window-fire-closed', ticks: 1 });
    const { a, b, win } = buildWindowCorridor(s, false);

    expect(s.world.blocksMovementAt(SPIKE_GRID, win.x, win.y)).toBe(true);
    expect(s.bridge.neighborsOf(s.bridge.targetAt(SPIKE_GRID, a.x, a.y)).map((t) => t.id)).not.toContain(
      `tile:${SPIKE_GRID}:${win.x},${win.y}`,
    );

    s.ignite(a.x, a.y);
    for (let i = 0; i < 60; i += 1) s.tick();

    expect(isBurning(s, a.x, a.y) || s.world.tileAt(SPIKE_GRID, a.x, a.y).materialId !== 'pinho').toBe(true);
    expect(isBurning(s, win.x, win.y)).toBe(false);
    expect(isBurning(s, b.x, b.y)).toBe(false);
  });

  it('janela aberta permite fire-spread até o outro lado', () => {
    const s = createFireSession({ seed: 'window-fire-open', ticks: 1 });
    const { a, b, win } = buildWindowCorridor(s, true);

    expect(s.world.blocksMovementAt(SPIKE_GRID, win.x, win.y)).toBe(false);
    expect(s.bridge.neighborsOf(s.bridge.targetAt(SPIKE_GRID, a.x, a.y)).map((t) => t.id)).toContain(
      `tile:${SPIKE_GRID}:${win.x},${win.y}`,
    );

    s.ignite(a.x, a.y);
    let bEverBurned = false;
    for (let i = 0; i < 80; i += 1) {
      s.tick();
      if (isBurning(s, b.x, b.y)) {
        bEverBurned = true;
        break;
      }
    }
    expect(bEverBurned).toBe(true);
  });

  it('abrir a janela depois deixa o fogo atravessar', () => {
    const s = createFireSession({ seed: 'window-fire-later', ticks: 1 });
    const { a, b, win } = buildWindowCorridor(s, false);

    s.ignite(a.x, a.y);
    for (let i = 0; i < 6; i += 1) s.tick();
    expect(isBurning(s, a.x, a.y)).toBe(true);
    expect(isBurning(s, b.x, b.y)).toBe(false);

    s.world.setStructural(SPIKE_GRID, win.x, win.y, { isOpen: true });
    let bEverBurned = false;
    for (let i = 0; i < 80; i += 1) {
      s.tick();
      if (isBurning(s, b.x, b.y)) {
        bEverBurned = true;
        break;
      }
    }
    expect(bEverBurned).toBe(true);
  });
});
