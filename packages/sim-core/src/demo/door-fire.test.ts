/**
 * Porta fechada isola aresta de vizinhança: fogo não salta para o outro lado.
 * Porta aberta acopla de novo (propagação A → porta → B).
 */
import { describe, expect, it } from 'vitest';
import { createFireSession, type FireSession } from './fire.js';
import { SPIKE_GRID } from '../spike/room.js';

function isBurning(s: FireSession, x: number, y: number): boolean {
  return Boolean(
    s.sim.overlayAt(SPIKE_GRID, x, y)?.states?.some((st) => st.type === 'burning' && st.intensity > 0),
  );
}

/** Corredor 1-cell: parede / A / porta / B / parede — sem caminho à volta. */
function buildDoorCorridor(s: FireSession, doorOpen: boolean): { a: { x: number; y: number }; b: { x: number; y: number }; door: { x: number; y: number } } {
  const a = { x: 2, y: 2 };
  const door = { x: 3, y: 2 };
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

  s.world.setType(SPIKE_GRID, door.x, door.y, 'door');
  s.world.setMaterial(SPIKE_GRID, door.x, door.y, 'pinho');
  if (doorOpen) s.world.openDoor(SPIKE_GRID, door.x, door.y);
  else s.world.closeDoor(SPIKE_GRID, door.x, door.y);

  return { a, b, door };
}

describe('Porta e propagação de fogo', () => {
  it('porta fechada bloqueia fire-spread para o outro lado', () => {
    const s = createFireSession({ seed: 'door-fire-closed', ticks: 1 });
    const { a, b, door } = buildDoorCorridor(s, false);

    expect(s.world.blocksMovementAt(SPIKE_GRID, door.x, door.y)).toBe(true);
    expect(s.bridge.neighborsOf(s.bridge.targetAt(SPIKE_GRID, a.x, a.y)).map((t) => t.id)).not.toContain(
      `tile:${SPIKE_GRID}:${door.x},${door.y}`,
    );

    s.ignite(a.x, a.y);
    for (let i = 0; i < 60; i += 1) s.tick();

    expect(isBurning(s, a.x, a.y) || s.world.tileAt(SPIKE_GRID, a.x, a.y).materialId !== 'pinho').toBe(true);
    expect(isBurning(s, door.x, door.y)).toBe(false);
    expect(isBurning(s, b.x, b.y)).toBe(false);
  });

  it('porta aberta permite fire-spread até o outro lado', () => {
    const s = createFireSession({ seed: 'door-fire-open', ticks: 1 });
    const { a, b, door } = buildDoorCorridor(s, true);

    expect(s.world.blocksMovementAt(SPIKE_GRID, door.x, door.y)).toBe(false);
    expect(s.bridge.neighborsOf(s.bridge.targetAt(SPIKE_GRID, a.x, a.y)).map((t) => t.id)).toContain(
      `tile:${SPIKE_GRID}:${door.x},${door.y}`,
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

  it('abrir a porta depois deixa o fogo atravessar', () => {
    const s = createFireSession({ seed: 'door-fire-later', ticks: 1 });
    const { a, b, door } = buildDoorCorridor(s, false);

    s.ignite(a.x, a.y);
    for (let i = 0; i < 6; i += 1) s.tick();
    expect(isBurning(s, a.x, a.y)).toBe(true);
    expect(isBurning(s, b.x, b.y)).toBe(false);

    s.world.openDoor(SPIKE_GRID, door.x, door.y);
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
