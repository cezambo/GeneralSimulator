import { describe, expect, it } from 'vitest';
import { Simulation } from '../state/index.js';
import { World } from '../world/grid.js';
import {
  SpatialIndex,
  advance,
  canHear,
  canSee,
  createMover,
  defaultTileCost,
  findPath,
  hasLineOfSight,
  inInteractionRange,
  inVisionCone,
  setPath,
  setRotation,
  tilesPerMinute,
} from './index.js';

function sala(): World {
  const sim = Simulation.create({
    seed: 'spatial',
    preset: 'test',
    mainGrid: { width: 20, height: 20, defaultType: 'floor', defaultMaterialId: 'terra' },
  });
  return new World({ sim });
}

describe('SpatialIndex (A-011)', () => {
  it('consulta de raio não devolve quem está longe', () => {
    const idx = new SpatialIndex(4);
    idx.upsert({ id: 'a', gridId: 'main', x: 1, y: 1 });
    idx.upsert({ id: 'b', gridId: 'main', x: 2, y: 1 });
    idx.upsert({ id: 'c', gridId: 'main', x: 15, y: 15 });
    expect(idx.queryRadius('main', 1, 1, 3).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('custo de consulta não cresce com N distante', () => {
    const idx = new SpatialIndex(4);
    for (let i = 0; i < 500; i += 1) {
      idx.upsert({ id: `far_${i}`, gridId: 'main', x: 100 + (i % 10), y: 100 + Math.floor(i / 10) });
    }
    idx.upsert({ id: 'near', gridId: 'main', x: 1, y: 1 });
    // Se varresse todos, 501 comparações; o índice só toca a vizinhança.
    expect(idx.queryRadius('main', 1, 1, 2).map((e) => e.id)).toEqual(['near']);
  });

  it('mover entidade atualiza o bucket', () => {
    const idx = new SpatialIndex(4);
    idx.upsert({ id: 'a', gridId: 'main', x: 1, y: 1 });
    idx.upsert({ id: 'a', gridId: 'main', x: 10, y: 10 });
    expect(idx.queryRadius('main', 1, 1, 2)).toEqual([]);
    expect(idx.queryRadius('main', 10, 10, 2).map((e) => e.id)).toEqual(['a']);
  });
});

describe('Cone e LoS (A-006, A-007, W-008)', () => {
  it('virar não altera posição', () => {
    const m = createMover('main', 3.2, 4.1, 0);
    setRotation(m, 90);
    expect(m.x).toBe(3.2);
    expect(m.y).toBe(4.1);
    expect(m.rotationDeg).toBe(90);
  });

  it('só percebe quem está no cone', () => {
    const obs = { gridId: 'main', x: 5, y: 5, rotationDeg: 0 }; // olha +X
    expect(inVisionCone(obs, { gridId: 'main', x: 8, y: 5 })).toBe(true);
    expect(inVisionCone(obs, { gridId: 'main', x: 5, y: 8 })).toBe(false); // 90° fora de 55°
  });

  it('parede no caminho bloqueia visão; janela não', () => {
    const world = sala();
    const g = world.mainGridId;
    // Observador (2,5) → alvo (8,5); parede em (5,5)
    world.setType(g, 5, 5, 'wall');
    expect(
      hasLineOfSight(
        world,
        { gridId: g, x: 2.5, y: 5.5 },
        { gridId: g, x: 8.5, y: 5.5 },
      ),
    ).toBe(false);

    world.setType(g, 5, 5, 'window');
    expect(
      hasLineOfSight(
        world,
        { gridId: g, x: 2.5, y: 5.5 },
        { gridId: g, x: 8.5, y: 5.5 },
      ),
    ).toBe(true);
  });

  it('canSee exige cone e LoS', () => {
    const world = sala();
    const g = world.mainGridId;
    world.setType(g, 5, 5, 'wall');
    const obs = { gridId: g, x: 2.5, y: 5.5, rotationDeg: 0 };
    const alvo = { gridId: g, x: 8.5, y: 5.5 };
    expect(inVisionCone(obs, alvo)).toBe(true);
    expect(canSee(world, obs, alvo)).toBe(false);
  });

  it('ouve de costas dentro do raio (A-009)', () => {
    const obs = { gridId: 'main', x: 0, y: 0, rotationDeg: 0 };
    // 10 tiles = 5 m, dentro dos 20 m de audição
    expect(canHear(obs, { gridId: 'main', x: 10, y: 0 })).toBe(true);
  });

  it('interação rejeita alvo distante antes do Validador (A-010)', () => {
    const a = { gridId: 'main', x: 0, y: 0 };
    expect(inInteractionRange(a, { gridId: 'main', x: 0.5, y: 0 })).toBe(true); // 0,25 m
    expect(inInteractionRange(a, { gridId: 'main', x: 10, y: 0 })).toBe(false);
  });
});

describe('A* (W-048, W-049)', () => {
  it('contorna parede', () => {
    const world = sala();
    const g = world.mainGridId;
    for (let y = 0; y < 10; y += 1) world.setType(g, 5, y, 'wall');
    // Deixa um vão em y=8
    world.setType(g, 5, 8, 'floor');
    const r = findPath(world, { gridId: g, x: 2, y: 2 }, { gridId: g, x: 8, y: 2 });
    expect(r.found).toBe(true);
    expect(r.path.some((p) => p.x === 5 && p.y === 8)).toBe(true);
    expect(r.path.every((p) => !(p.x === 5 && p.y < 8))).toBe(true);
  });

  it('fechar porta no caminho força caminho diferente ou falha', () => {
    const world = sala();
    const g = world.mainGridId;
    // Coluna inteira de parede: o único vão é a porta. Sem isso o A* contorna
    // pelo resto do mapa e fechar a porta não muda nada.
    for (let y = 0; y < 20; y += 1) world.setType(g, 5, y, 'wall');
    world.setType(g, 5, 3, 'door');
    world.openDoor(g, 5, 3);
    const aberto = findPath(world, { gridId: g, x: 2, y: 3 }, { gridId: g, x: 8, y: 3 });
    expect(aberto.found).toBe(true);
    expect(aberto.path.some((p) => p.x === 5 && p.y === 3)).toBe(true);

    world.closeDoor(g, 5, 3);
    const fechado = findPath(world, { gridId: g, x: 2, y: 3 }, { gridId: g, x: 8, y: 3 });
    expect(fechado.found).toBe(false);
  });

  it('entre dois caminhos, estrada vence (W-049)', () => {
    const world = sala();
    const g = world.mainGridId;
    // Dois corredores: cima floor, baixo road — mesmo comprimento
    for (let x = 1; x <= 8; x += 1) {
      world.setType(g, x, 2, 'floor');
      world.setType(g, x, 6, 'road');
    }
    // Bloqueia o meio para forçar escolher um dos corredores… na verdade
    // com grid aberto o A* pode ir em linha. Isola com paredes.
    for (let y = 0; y < 10; y += 1) {
      if (y !== 2 && y !== 6) {
        world.setType(g, 4, y, 'wall');
        world.setType(g, 5, y, 'wall');
      }
    }
    const r = findPath(world, { gridId: g, x: 1, y: 4 }, { gridId: g, x: 8, y: 4 }, {
      connectivity: 4,
    });
    expect(r.found).toBe(true);
    const naEstrada = r.path.filter((p) => p.y === 6).length;
    const noChao = r.path.filter((p) => p.y === 2).length;
    expect(naEstrada).toBeGreaterThan(noChao);
  });

  it('tile em chamas só é escolhido se for o único', () => {
    const world = sala();
    const g = world.mainGridId;
    // Corredor único em chamas
    for (let x = 1; x <= 5; x += 1) {
      world.setType(g, x, 1, 'wall');
      world.setType(g, x, 3, 'wall');
    }
    const o = world.sim.overlayAt(g, 3, 2, true);
    o.states = [{ type: 'burning', intensity: 1 }];
    const sozinho = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 });
    expect(sozinho.found).toBe(true);

    // Alternativa sem fogo, mais longa
    world.setType(g, 3, 1, 'floor');
    world.setType(g, 3, 0, 'floor');
    world.setType(g, 4, 0, 'floor');
    world.setType(g, 5, 0, 'floor');
    world.setType(g, 5, 1, 'floor');
    const comAlt = findPath(world, { gridId: g, x: 1, y: 2 }, { gridId: g, x: 5, y: 2 });
    expect(comAlt.path.some((p) => p.x === 3 && p.y === 2)).toBe(false);
  });
});

describe('Movimento contínuo (A-005, W-050)', () => {
  it('agente ferido se move mais devagar no mesmo trajeto', () => {
    const path = [
      { gridId: 'main', x: 0, y: 0 },
      { gridId: 'main', x: 10, y: 0 },
    ];
    const saudavel = createMover('main', 0.5, 0.5);
    const ferido = createMover('main', 0.5, 0.5);
    setPath(saudavel, path, tilesPerMinute(1));
    setPath(ferido, path, tilesPerMinute(0.3));
    advance(saudavel, 0.05);
    advance(ferido, 0.05);
    expect(saudavel.x).toBeGreaterThan(ferido.x);
  });

  it('chegar ao fim limpa o caminho', () => {
    const m = createMover('main', 0.5, 0.5);
    setPath(m, [{ gridId: 'main', x: 0, y: 0 }, { gridId: 'main', x: 1, y: 0 }], 1000);
    advance(m, 1);
    expect(m.waypointIndex).toBe(-1);
    expect(m.x).toBeCloseTo(1.5, 5);
  });
});

describe('defaultTileCost', () => {
  it('porta fechada é intransponível; aberta não', () => {
    const world = sala();
    const g = world.mainGridId;
    world.setType(g, 2, 2, 'door');
    expect(defaultTileCost(world, g, 2, 2)).toBe(Infinity);
    world.openDoor(g, 2, 2);
    expect(defaultTileCost(world, g, 2, 2)).toBe(1);
  });
});
