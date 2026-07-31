import { describe, expect, it } from 'vitest';
import { Simulation } from '../state/index.js';
import {
  DEFAULT_CALENDAR,
  DEFAULT_METERS_PER_TILE,
  SimClock,
  TILE_BLOCKING,
  World,
  blocksMovement,
  blocksVision,
  cellOf,
  metersToTiles,
  tilesToMeters,
} from './index.js';

function mundo(w = 32, h = 32): { sim: Simulation; world: World } {
  const sim = Simulation.create({
    seed: 'world-test',
    preset: 'test',
    mainGrid: { width: w, height: h, defaultType: 'floor', defaultMaterialId: 'terra' },
  });
  return { sim, world: new World({ sim }) };
}

describe('Escala (W-057)', () => {
  it('metros por tile vem de constante única, não de código espalhado', () => {
    expect(DEFAULT_METERS_PER_TILE).toBe(0.5);
    expect(metersToTiles(30)).toBe(60);
    expect(tilesToMeters(60)).toBe(30);
  });

  it('posição contínua mapeia para célula por floor', () => {
    expect(cellOf(12.37, 8.91)).toEqual({ x: 12, y: 8 });
    expect(cellOf(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('Tipos de tile (W-003, W-004)', () => {
  it('parede bloqueia movimento e visão; janela só movimento; chão nada', () => {
    expect(TILE_BLOCKING.wall).toEqual({ blocksMovement: true, blocksVision: true, canOpen: false });
    expect(TILE_BLOCKING.window).toEqual({
      blocksMovement: true,
      blocksVision: false,
      canOpen: false,
    });
    expect(TILE_BLOCKING.floor).toEqual({
      blocksMovement: false,
      blocksVision: false,
      canOpen: false,
    });
  });

  it('porta aberta deixa de bloquear', () => {
    expect(blocksMovement('door')).toBe(true);
    expect(blocksVision('door')).toBe(true);
    expect(blocksMovement('door', { isOpen: true })).toBe(false);
    expect(blocksVision('door', { isOpen: true })).toBe(false);
  });
});

describe('World — grid e overlay (W-001, W-058, W-059)', () => {
  it('célula é endereçável por grid e (x, y)', () => {
    const { world } = mundo();
    const t = world.tileAt(world.mainGridId, 3, 5);
    expect(t.pos).toEqual({ x: 3, y: 5 });
    expect(t.type).toBe('floor');
    expect(t.materialId).toBe('terra');
    expect(t.gridId).toBe(world.mainGridId);
  });

  it('agente para em posição contínua sem alinhamento forçado', () => {
    const { world } = mundo();
    const t = world.tileAtWorld(world.mainGridId, 12.37, 8.91);
    expect(t.pos).toEqual({ x: 12, y: 8 });
  });

  it('trocar material não exige tocar no tipo', () => {
    const { world } = mundo();
    world.setMaterial(world.mainGridId, 1, 1, 'pedra');
    expect(world.tileAt(world.mainGridId, 1, 1).materialId).toBe('pedra');
    expect(world.tileAt(world.mainGridId, 1, 1).type).toBe('floor');
  });

  it('overlay esparso: célula sem entrada é intacta', () => {
    const { sim, world } = mundo();
    expect(sim.overlayAt(world.mainGridId, 0, 0)).toBeUndefined();
    const t = world.tileAt(world.mainGridId, 0, 0);
    expect(t.state).toBeUndefined();
  });

  it('porta alterna aberta/fechada e o bloqueio responde', () => {
    const { world } = mundo();
    const g = world.mainGridId;
    world.setType(g, 2, 2, 'door');
    expect(world.blocksMovementAt(g, 2, 2)).toBe(true);
    world.openDoor(g, 2, 2);
    expect(world.blocksMovementAt(g, 2, 2)).toBe(false);
    expect(world.blocksVisionAt(g, 2, 2)).toBe(false);
    world.closeDoor(g, 2, 2);
    expect(world.blocksMovementAt(g, 2, 2)).toBe(true);
  });

  it('porta trancada não abre', () => {
    const { world } = mundo();
    const g = world.mainGridId;
    world.setType(g, 1, 1, 'door');
    world.setStructural(g, 1, 1, { isLocked: true });
    expect(() => world.openDoor(g, 1, 1)).toThrow(/trancada/);
  });

  it('janela bloqueia movimento mas não visão', () => {
    const { world } = mundo();
    const g = world.mainGridId;
    world.setType(g, 4, 4, 'window');
    expect(world.blocksMovementAt(g, 4, 4)).toBe(true);
    expect(world.blocksVisionAt(g, 4, 4)).toBe(false);
  });

  it('vizinhos em ordem N-E-S-W fixa', () => {
    const { world } = mundo();
    expect(world.neighbors4(world.mainGridId, 5, 5)).toEqual([
      { x: 5, y: 4 },
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 4, y: 5 },
    ]);
  });
});

describe('Grids alinhados (W-059, W-060)', () => {
  it('mundo com três grids devolve três malhas independentes', () => {
    const { world } = mundo(40, 40);
    world.addAlignedGrid({
      id: 'andar2',
      name: 'segundo andar',
      width: 20,
      height: 14,
      zLevel: 1,
      originOffset: { x: 5, y: 5 },
    });
    world.addAlignedGrid({
      id: 'porao',
      name: 'porão',
      width: 40,
      height: 40,
      zLevel: -1,
    });
    expect(world.grids()).toHaveLength(3);
    expect(world.tileAt('andar2', 0, 0).gridId).toBe('andar2');
    expect(world.toMain('andar2', 0, 0)).toEqual({ x: 5, y: 5 });
    expect(world.toAligned('andar2', 5, 5)).toEqual({ x: 0, y: 0 });
    expect(world.toAligned('andar2', 0, 0)).toBeUndefined();
  });

  it('pilha alinhada ordena do mais alto ao mais baixo', () => {
    const { world } = mundo(20, 20);
    world.addAlignedGrid({ id: 'up', width: 20, height: 20, zLevel: 2 });
    world.addAlignedGrid({ id: 'down', width: 20, height: 20, zLevel: -1 });
    expect(world.alignedStackAt(3, 3).map((g) => g.id)).toEqual(['up', 'main', 'down']);
  });
});

describe('SimClock (W-051, W-052, W-053, W-056)', () => {
  it('1440 ticks incrementam o dia em um', () => {
    const clock = { simTime: 0, speed: 1, paused: false, day: 1, season: 1, year: 1 };
    const sim = new SimClock(clock);
    expect(sim.day).toBe(1);
    sim.tickMany(1440);
    expect(clock.simTime).toBe(1440);
    expect(sim.day).toBe(2);
    expect(sim.season).toBe(1);
    expect(sim.year).toBe(1);
  });

  it('estação e ano viram nos limites do calendário', () => {
    const clock = { simTime: 0, speed: 1, paused: false };
    const sim = new SimClock(clock, DEFAULT_CALENDAR);
    // 15 dias × 1440 min = uma estação
    sim.tickMany(15 * 1440);
    expect(sim.day).toBe(1);
    expect(sim.season).toBe(2);
    // mais 3 estações = ano 2
    sim.tickMany(3 * 15 * 1440);
    expect(sim.year).toBe(2);
    expect(sim.season).toBe(1);
  });

  it('pausa congela o avanço', () => {
    const clock = { simTime: 10, speed: 1, paused: false };
    const sim = new SimClock(clock);
    sim.pause();
    expect(sim.tick()).toEqual([]);
    expect(clock.simTime).toBe(10);
    sim.resume();
    sim.tick();
    expect(clock.simTime).toBe(11);
  });

  it('velocidade fora do conjunto declarado é rejeitada', () => {
    const sim = new SimClock({ simTime: 0, speed: 1, paused: false });
    expect(() => sim.setSpeed(8)).toThrow(/fora do conjunto/);
    sim.setSpeed(5);
    expect(sim.speed).toBe(5);
    sim.setSpeed(0);
    expect(sim.paused).toBe(true);
  });

  it('evento agendado dispara no tick previsto', () => {
    const clock = { simTime: 0, speed: 1, paused: false };
    const sim = new SimClock(clock);
    const seen: number[] = [];
    sim.on('ping', (t) => seen.push(t));
    sim.schedule('ping', 3);
    sim.tickMany(2);
    expect(seen).toEqual([]);
    sim.tick();
    expect(seen).toEqual([3]);
  });

  it('fila sobrevive a snapshot/restore (save)', () => {
    const clock = { simTime: 0, speed: 1, paused: false };
    const a = new SimClock(clock);
    a.schedule('later', 5, { n: 1 });
    const snap = a.snapshotQueue();
    a.tickMany(5);
    expect(a.snapshotQueue().events).toHaveLength(0);

    const clock2 = { simTime: 0, speed: 1, paused: false };
    const b = new SimClock(clock2);
    b.restoreQueue(snap);
    const fired = b.tickMany(5);
    expect(fired.map((e) => e.kind)).toEqual(['later']);
    expect(fired[0]!.payload).toEqual({ n: 1 });
  });

  it('dois eventos no mesmo tick disparam em ordem estável por id', () => {
    const clock = { simTime: 0, speed: 1, paused: false };
    const sim = new SimClock(clock);
    const order: string[] = [];
    sim.on('a', () => order.push('a'));
    sim.on('b', () => order.push('b'));
    // Agenda b antes de a; ids crescem, então a (evt_1) vem antes de b (evt_2) no sort por id… 
    // schedule order: first call gets evt_1
    const idA = sim.schedule('a', 1);
    const idB = sim.schedule('b', 1);
    expect(idA < idB).toBe(true);
    sim.tick();
    expect(order).toEqual(['a', 'b']);
  });
});
