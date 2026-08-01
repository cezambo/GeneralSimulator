import { describe, expect, it } from 'vitest';
import { Simulation } from '../state/index.js';
import {
  createMover,
  findPath,
  setPath,
} from '../spatial/index.js';
import { World } from '../world/grid.js';
import {
  avoidBurningCost,
  isBurningTile,
  isSmokyTile,
  pathNeedsRepath,
} from './mover-fire.js';

function sala(): World {
  const sim = Simulation.create({
    seed: 'mover-fire',
    preset: 'test',
    mainGrid: { width: 20, height: 20, defaultType: 'floor', defaultMaterialId: 'terra' },
  });
  return new World({ sim });
}

function ignite(world: World, x: number, y: number): void {
  const o = world.sim.overlayAt(world.mainGridId, x, y, true);
  o.states = [{ type: 'burning', intensity: 80 }];
}

function smoke(world: World, x: number, y: number): void {
  const o = world.sim.overlayAt(world.mainGridId, x, y, true);
  o.states = [{ type: 'smoky', intensity: 40 }];
}

/** Corredor y=2 com paredes; desvio por y=0. */
function corridorWithDetour(world: World): string {
  const g = world.mainGridId;
  for (let x = 1; x <= 5; x += 1) {
    world.setType(g, x, 1, 'wall');
    world.setType(g, x, 3, 'wall');
  }
  world.setType(g, 2, 1, 'floor');
  world.setType(g, 2, 0, 'floor');
  world.setType(g, 3, 0, 'floor');
  world.setType(g, 4, 0, 'floor');
  world.setType(g, 4, 1, 'floor');
  return g;
}

/** Corredor único em y=2: só passa por (3,2). */
function singleLaneCorridor(world: World): string {
  const g = world.mainGridId;
  for (let y = 0; y < 20; y += 1) {
    world.setType(g, 2, y, 'wall');
    world.setType(g, 4, y, 'wall');
  }
  world.setType(g, 2, 2, 'floor');
  world.setType(g, 4, 2, 'floor');
  return g;
}

describe('mover-fire (demo evita chamas e fumo)', () => {
  it('isBurningTile lê overlay fundido', () => {
    const world = sala();
    const g = world.mainGridId;
    expect(isBurningTile(world, g, 3, 3)).toBe(false);
    ignite(world, 3, 3);
    expect(isBurningTile(world, g, 3, 3)).toBe(true);
  });

  it('isSmokyTile lê overlay fundido', () => {
    const world = sala();
    const g = world.mainGridId;
    expect(isSmokyTile(world, g, 3, 3)).toBe(false);
    smoke(world, 3, 3);
    expect(isSmokyTile(world, g, 3, 3)).toBe(true);
  });

  it('A* com avoidBurningCost contorna fogo quando há alternativa', () => {
    const world = sala();
    const g = corridorWithDetour(world);
    ignite(world, 3, 2);

    const hard = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    expect(hard.found).toBe(true);
    expect(hard.path.some((p) => p.x === 3 && p.y === 2)).toBe(false);
    expect(hard.path.some((p) => p.y === 0)).toBe(true);
  });

  it('A* com avoidBurningCost contorna fumo quando há alternativa', () => {
    const world = sala();
    const g = corridorWithDetour(world);
    smoke(world, 3, 2);

    const hard = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    expect(hard.found).toBe(true);
    expect(hard.path.some((p) => p.x === 3 && p.y === 2)).toBe(false);
    expect(hard.path.some((p) => p.y === 0)).toBe(true);
  });

  it('sem desvio, avoidBurningCost falha (pausar / esperar)', () => {
    const world = sala();
    const g = singleLaneCorridor(world);
    ignite(world, 3, 2);

    const soft = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
    });
    expect(soft.found).toBe(true);

    const hard = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    expect(hard.found).toBe(false);
  });

  it('sem desvio, fumo também falha o A* da demo', () => {
    const world = sala();
    const g = singleLaneCorridor(world);
    smoke(world, 3, 2);

    const soft = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
    });
    expect(soft.found).toBe(true);

    const hard = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    expect(hard.found).toBe(false);
  });

  it('pathNeedsRepath quando fogo aparece no caminho restante', () => {
    const world = sala();
    const g = world.mainGridId;
    const m = createMover(g, 1.5, 2.5);
    setPath(
      m,
      [
        { gridId: g, x: 1, y: 2 },
        { gridId: g, x: 2, y: 2 },
        { gridId: g, x: 3, y: 2 },
        { gridId: g, x: 4, y: 2 },
      ],
      1,
    );
    expect(pathNeedsRepath(world, m)).toBe(false);
    ignite(world, 3, 2);
    expect(pathNeedsRepath(world, m)).toBe(true);
  });

  it('pathNeedsRepath quando fumo aparece no caminho restante', () => {
    const world = sala();
    const g = world.mainGridId;
    const m = createMover(g, 1.5, 2.5);
    setPath(
      m,
      [
        { gridId: g, x: 1, y: 2 },
        { gridId: g, x: 2, y: 2 },
        { gridId: g, x: 3, y: 2 },
        { gridId: g, x: 4, y: 2 },
      ],
      1,
    );
    expect(pathNeedsRepath(world, m)).toBe(false);
    smoke(world, 3, 2);
    expect(pathNeedsRepath(world, m)).toBe(true);
  });

  it('pathNeedsRepath ignora chama na célula atual (escapar)', () => {
    const world = sala();
    const g = world.mainGridId;
    const m = createMover(g, 3.5, 2.5);
    setPath(
      m,
      [
        { gridId: g, x: 3, y: 2 },
        { gridId: g, x: 4, y: 2 },
        { gridId: g, x: 5, y: 2 },
      ],
      1,
    );
    ignite(world, 3, 2);
    expect(pathNeedsRepath(world, m)).toBe(false);
    ignite(world, 4, 2);
    expect(pathNeedsRepath(world, m)).toBe(true);
  });

  it('pathNeedsRepath ignora fumo na célula atual (escapar)', () => {
    const world = sala();
    const g = world.mainGridId;
    const m = createMover(g, 3.5, 2.5);
    setPath(
      m,
      [
        { gridId: g, x: 3, y: 2 },
        { gridId: g, x: 4, y: 2 },
        { gridId: g, x: 5, y: 2 },
      ],
      1,
    );
    smoke(world, 3, 2);
    expect(pathNeedsRepath(world, m)).toBe(false);
    smoke(world, 4, 2);
    expect(pathNeedsRepath(world, m)).toBe(true);
  });

  it('agente em fumo consegue A* para fora (custo do start não bloqueia)', () => {
    const world = sala();
    const g = world.mainGridId;
    smoke(world, 2, 2);

    const escape = findPath(world, { gridId: g, x: 2, y: 2 }, { gridId: g, x: 5, y: 2 }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    expect(escape.found).toBe(true);
    expect(escape.path[0]).toEqual({ gridId: g, x: 2, y: 2 });
    // Não reentra no fumo depois de sair
    expect(escape.path.slice(1).some((p) => p.x === 2 && p.y === 2)).toBe(false);
  });
});
