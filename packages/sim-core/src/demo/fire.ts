/**
 * Demo V1: incêndio numa sala, zero LLM.
 *
 * Aceite do roadmap: fogo se alastra, consome, apaga e deixa resíduo.
 */

import { loadConfig, type SimConfig } from '../config/load.js';
import { Substrate } from '../substrate/index.js';
import { TileReactiveBridge } from '../substrate/world-bridge.js';
import { buildSpikeRoom, SPIKE_GRID } from '../spike/room.js';
import type { Simulation } from '../state/index.js';
import type { World } from '../world/grid.js';
import { SimClock } from '../world/clock.js';

export interface FireDemoOptions {
  readonly seed?: string;
  readonly ticks?: number;
  /** Célula onde a chama começa (interior da sala). */
  readonly ignition?: { x: number; y: number };
  readonly config?: SimConfig;
}

export interface FireDemoResult {
  readonly ticks: number;
  readonly peakBurning: number;
  readonly finalBurning: number;
  readonly cellsEverBurned: number;
  readonly residueCells: number;
  readonly llmCalls: 0;
}

export interface FireSession {
  readonly sim: Simulation;
  readonly world: World;
  readonly clock: SimClock;
  readonly substrate: Substrate;
  readonly bridge: TileReactiveBridge;
  ignite(x?: number, y?: number): void;
  tick(): { burning: number; dirty: { x: number; y: number; gridId: string }[] };
  run(ticks: number): FireDemoResult;
}

function countBurning(sim: Simulation, world: World, ever: Set<string>): number {
  let burning = 0;
  const grid = world.grid(SPIKE_GRID);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const o = sim.overlayAt(SPIKE_GRID, x, y);
      if (o?.states?.some((s) => s.type === 'burning' && s.intensity > 0)) {
        burning += 1;
        ever.add(`${x},${y}`);
      }
    }
  }
  return burning;
}

function countResidue(world: World): number {
  let residue = 0;
  const grid = world.grid(SPIKE_GRID);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const mat = world.tileAt(SPIKE_GRID, x, y).materialId;
      if (mat === 'cinza' || mat === 'carvao' || mat === 'lascas') residue += 1;
    }
  }
  return residue;
}

export function createFireSession(opts: FireDemoOptions = {}): FireSession {
  const cfg = opts.config ?? loadConfig();
  const seed = opts.seed ?? 'fire-v1';
  const { sim, world } = buildSpikeRoom(cfg, seed);
  sim.state.clock.paused = false;
  sim.state.clock.speed = 1;

  const clock = new SimClock(sim.state.clock, {
    minutesPerTick: cfg.tuning.minutesPerTick,
    hoursPerDay: cfg.tuning.hoursPerDay,
    daysPerSeason: cfg.tuning.daysPerSeason,
    seasonsPerYear: cfg.tuning.seasonsPerYear,
    availableSpeeds: cfg.tuning.availableSpeeds,
  });

  const bridge = new TileReactiveBridge(sim, world);
  const substrate = new Substrate({
    materials: cfg.materials,
    matrix: cfg.reactions,
    effects: cfg.effects,
    rng: sim.rng.stream('substrato'),
    tuning: {
      stateDecayPerTick: cfg.tuning.stateDecayPerTick,
      maxActiveTargets: cfg.tuning.maxActiveTargets,
      thermalEquilibriumTolerance: cfg.tuning.thermalEquilibriumTolerance,
      maxCascadeStepsPerTick: cfg.tuning.maxCascadeStepsPerTick,
      burnIntegrityLossPerTick: cfg.tuning.burnIntegrityLossPerTick,
    },
  });

  const everBurned = new Set<string>();
  const ignition = opts.ignition ?? { x: 1, y: 1 };

  const session: FireSession = {
    sim,
    world,
    clock,
    substrate,
    bridge,
    ignite(x = ignition.x, y = ignition.y) {
      const t = bridge.targetAt(SPIKE_GRID, x, y);
      substrate.invoke('ignite', t, { simTime: clock.simTime, world: bridge }, { intensity: 80 });
      bridge.commit();
      everBurned.add(`${x},${y}`);
    },
    tick() {
      clock.tick();
      substrate.tick({ simTime: clock.simTime, world: bridge });
      const dirty = bridge.commit();
      const burning = countBurning(sim, world, everBurned);
      return { burning, dirty };
    },
    run(ticks: number) {
      session.ignite();
      let peak = countBurning(sim, world, everBurned);
      for (let i = 0; i < ticks; i += 1) {
        const r = session.tick();
        if (r.burning > peak) peak = r.burning;
      }
      return {
        ticks,
        peakBurning: peak,
        finalBurning: countBurning(sim, world, everBurned),
        cellsEverBurned: everBurned.size,
        residueCells: countResidue(world),
        llmCalls: 0,
      };
    },
  };

  return session;
}

export function runFireDemo(opts: FireDemoOptions = {}): FireDemoResult {
  const session = createFireSession(opts);
  return session.run(opts.ticks ?? 80);
}
