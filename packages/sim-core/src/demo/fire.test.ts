import { describe, expect, it } from 'vitest';
import { createFireSession, runFireDemo, type FireSession } from './fire.js';
import { BuildHistory } from '../protocol/build.js';
import { CHAIR_ID, SPIKE_GRID } from '../spike/room.js';

function countBurningCells(s: FireSession): number {
  let n = 0;
  const grid = s.world.grid(SPIKE_GRID);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const o = s.sim.overlayAt(SPIKE_GRID, x, y);
      if (o?.states?.some((st) => st.type === 'burning' && st.intensity > 0)) n += 1;
    }
  }
  return n;
}

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

  it('água apaga fogo mesmo com vizinho em chama (bridge não desfaz extinguish)', () => {
    const s = createFireSession({ seed: 'wet-nbr', ticks: 1 });
    const a = s.bridge.targetAt(SPIKE_GRID, 2, 2);
    const b = s.bridge.targetAt(SPIKE_GRID, 3, 2);
    const ctx = { simTime: s.clock.simTime, world: s.bridge };
    s.substrate.invoke('ignite', a, ctx, { intensity: 80 });
    s.substrate.invoke('ignite', b, ctx, { intensity: 80 });
    s.bridge.commit();
    for (let i = 0; i < 25; i += 1) s.tick();

    const alvo = s.bridge.targetAt(SPIKE_GRID, 2, 2);
    const burningBefore = countBurningCells(s);
    s.substrate.invoke('wet', alvo, { simTime: s.clock.simTime, world: s.bridge }, { intensity: 90 });
    // Ferramenta GM: settle contínuo (não tick completo — senão o fogo espalha).
    s.substrate.settleContinuous([alvo], { simTime: s.clock.simTime, world: s.bridge });
    s.bridge.commit();

    const o = s.sim.overlayAt(SPIKE_GRID, 2, 2);
    expect(o?.states?.some((st) => st.type === 'burning')).toBe(false);
    expect(o?.states?.some((st) => st.type === 'smoky' || st.type === 'wet')).toBe(true);
    // Sem tick global: o mapa não ganha focos novos neste clique.
    expect(countBurningCells(s)).toBeLessThanOrEqual(burningBefore);
  });

  it('tile em chama no centro do foco passa de 400 °C', () => {
    const s = createFireSession({ seed: 'fire-hot', ticks: 1 });
    s.ignite(2, 2);
    for (let i = 0; i < 6; i += 1) s.tick();
    const temp = s.sim.overlayAt(SPIKE_GRID, 2, 2)?.temperature;
    expect(temp).toBeGreaterThan(400);
  });

  it('móvel inflamável na célula do fogo acende e perde integridade', () => {
    const s = createFireSession({ seed: 'fire-chair', ticks: 1 });
    const chair = s.sim.state.objects[CHAIR_ID]!;
    // Põe a cadeira sobre o foco.
    chair.pos = { x: 2.5, y: 2.5 };
    s.ignite(2, 2);
    // Garante ignição do móvel: a matriz pode falhar o sorteio, e orgânico
    // em contato também pode abafar — o aceite é queima + perda de integridade.
    const chairT = s.bridge.objectTarget(chair);
    s.substrate.invoke('ignite', chairT, { simTime: s.clock.simTime, world: s.bridge }, {
      intensity: 70,
    });
    s.bridge.commit();
    for (let i = 0; i < 12; i += 1) s.tick();
    const after = s.sim.state.objects[CHAIR_ID];
    // Consumida, ainda em chama, ou apagou por O₂/fumaça depois de ter queimado
    // (integridade caiu / ficou smoky).
    if (after) {
      expect(after.integrity ?? 100).toBeLessThan(100);
      const rastrou =
        after.states?.some((st) => st.type === 'burning' && st.intensity > 0) ||
        after.states?.some((st) => st.type === 'smoky' && st.intensity > 0);
      expect(rastrou).toBe(true);
    } else {
      expect(after).toBeUndefined();
    }
  });

  it('móvel consumido pelo fogo deixa cinza/carvão no chão', () => {
    const s = createFireSession({ seed: 'fire-chair-ash', ticks: 1 });
    const chair = s.sim.state.objects[CHAIR_ID]!;
    chair.pos = { x: 2.5, y: 2.5 };
    // Acelera o consumo: quase destruída + foco forte.
    chair.integrity = 6;
    const t = s.bridge.objectTarget(chair);
    t.integrity = 6;
    s.ignite(2, 2);

    let sawSmokyOnConsume = false;
    for (let i = 0; i < 30; i += 1) {
      s.tick();
      if (s.sim.state.objects[CHAIR_ID] === undefined) {
        const overlay = s.sim.overlayAt(SPIKE_GRID, 2, 2);
        sawSmokyOnConsume = Boolean(overlay?.states?.some((st) => st.type === 'smoky'));
        break;
      }
    }

    expect(s.sim.state.objects[CHAIR_ID]).toBeUndefined();
    const cell = s.world.tileAt(SPIKE_GRID, 2, 2);
    expect(cell.type).toBe('floor');
    expect(['carvao', 'cinza', 'lascas']).toContain(cell.materialId);
    expect(sawSmokyOnConsume).toBe(true);
    expect(s.sim.overlayAt(SPIKE_GRID, 2, 2)?.integrity).toBeLessThanOrEqual(35);
  });

  it('molhar parede refeita sobre escombro não destrói a geometria', () => {
    const s = createFireSession({ seed: 'wet-wall', ticks: 1 });
    // Simula escombro: integrity 0 + chão, depois paint de parede (overlay sujo).
    s.world.setType(SPIKE_GRID, 4, 4, 'floor');
    s.world.setMaterial(SPIKE_GRID, 4, 4, 'carvao');
    const overlay = s.sim.overlayAt(SPIKE_GRID, 4, 4, true);
    overlay.integrity = 0;
    overlay.states = [{ type: 'smoky', intensity: 20 }];
    // Proxy antigo “lembra” o escombro.
    const stale = s.bridge.targetAt(SPIKE_GRID, 4, 4);
    expect(stale.integrity).toBe(0);

    // Construção: parede nova limpa overlay (BuildHistory.#applyTile).
    const build = new BuildHistory(s.sim, s.world);
    build.paintTiles('wall', 'pedra', [{ x: 4, y: 4 }]);
    expect(s.world.tileAt(SPIKE_GRID, 4, 4).type).toBe('wall');
    expect(s.sim.overlayAt(SPIKE_GRID, 4, 4)?.integrity).toBe(100);

    const t = s.bridge.targetAt(SPIKE_GRID, 4, 4);
    const ctx = { simTime: s.clock.simTime, world: s.bridge };
    s.substrate.invoke('wet', t, ctx, { intensity: 90 });
    s.substrate.settleContinuous([t], ctx);
    s.bridge.commit();

    const cell = s.world.tileAt(SPIKE_GRID, 4, 4);
    expect(cell.type).toBe('wall');
    expect(cell.materialId).toBe('pedra');
    expect(s.sim.overlayAt(SPIKE_GRID, 4, 4)?.states?.some((st) => st.type === 'wet')).toBe(true);
    expect(s.world.blocksMovementAt(SPIKE_GRID, 4, 4)).toBe(true);
  });
});
