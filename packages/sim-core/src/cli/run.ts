/**
 * Entrada CLI do sim-core. X-001.
 *
 * Uso:
 *   npm run sim -- spike
 *   npm run sim -- serve
 *   npm run sim -- fire
 */

import { loadConfig } from '../config/index.js';
import { runFireDemo } from '../demo/fire.js';
import { ProtocolHub, startProtocolServer, DEFAULT_PORT } from '../protocol/index.js';
import { runSpike } from '../spike/index.js';
import { buildSpikeRoom, loadSpikeAgents, SPIKE_GRID } from '../spike/room.js';
import { SimClock } from '../world/clock.js';
import { Substrate, TileReactiveBridge } from '../substrate/index.js';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'spike';

  if (cmd === 'spike') {
    await runSpikeCmd();
    return;
  }
  if (cmd === 'serve') {
    await runServeCmd();
    return;
  }
  if (cmd === 'fire') {
    const r = runFireDemo({
      seed: process.env['SIM_SEED'] ?? 'fire-v1',
      ticks: Number(process.env['SIM_FIRE_TICKS'] ?? 80),
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.error(`comando desconhecido: ${cmd}. Disponível: spike, serve, fire`);
  process.exitCode = 1;
}

async function runSpikeCmd(): Promise<void> {
  const mode =
    process.env['SIM_LLM_MODE'] === 'replay' ||
    process.env['SIM_LLM_MODE'] === 'live' ||
    process.env['SIM_LLM_MODE'] === 'hybrid'
      ? process.env['SIM_LLM_MODE']
      : 'hybrid';

  const result = await runSpike({
    seed: process.env['SIM_SEED'] ?? 'spike-v0',
    days: Number(process.env['SIM_DAYS'] ?? 3),
    mode,
  });

  console.log(
    JSON.stringify(
      {
        fingerprint: result.fingerprint,
        thoughts: result.thoughts,
        validations: result.validations,
        memoriesAdded: result.memoriesAdded,
        llmCostUsd: result.llmCostUsd,
        providerCalls: result.providerCalls,
        cassetteHits: result.cassetteHits,
        finalPositions: result.finalPositions,
        sampleEvents: result.events.slice(0, 8),
      },
      null,
      2,
    ),
  );
}

async function runServeCmd(): Promise<void> {
  const cfg = loadConfig();
  const withFire = process.env['SIM_FIRE'] !== '0';
  const { sim, world } = buildSpikeRoom(cfg, process.env['SIM_SEED'] ?? 'serve-v0');
  const { lia, rui } = loadSpikeAgents();
  sim.state.agents[lia.id] = lia;
  sim.state.agents[rui.id] = rui;
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

  if (withFire) {
    const t = bridge.targetAt(SPIKE_GRID, 1, 1);
    substrate.invoke('ignite', t, { simTime: 0, world: bridge }, { intensity: 80 });
    bridge.commit();
  }

  const hub = new ProtocolHub({ sim, world, clock });
  const port = Number(process.env['SIM_PORT'] ?? DEFAULT_PORT);
  const server = await startProtocolServer({ hub, port, host: '127.0.0.1' });

  console.log(
    JSON.stringify({
      listening: `ws://127.0.0.1:${server.port}`,
      fire: withFire,
      hint: 'Godot: packages/client-godot · SIM_FIRE=0 para sala sem chama',
    }),
  );

  const timer = setInterval(() => {
    if (clock.paused || clock.speed === 0) return;
    const steps = Math.max(1, clock.speed);
    let dirtyTiles: { x: number; y: number; gridId: string }[] = [];
    for (let i = 0; i < steps; i += 1) {
      clock.tick();
      substrate.tick({ simTime: clock.simTime, world: bridge });
      dirtyTiles = dirtyTiles.concat(bridge.commit());
    }
    if (dirtyTiles.length > 0) {
      const uniq = new Map<string, { x: number; y: number; gridId: string }>();
      for (const d of dirtyTiles) uniq.set(`${d.gridId}:${d.x},${d.y}`, d);
      const tiles = [...uniq.values()].map((d) => {
        const t = world.tileAt(d.gridId, d.x, d.y);
        const o = sim.overlayAt(d.gridId, d.x, d.y);
        return {
          x: d.x,
          y: d.y,
          type: t.type,
          materialId: t.materialId,
          ...(o?.states?.length
            ? { states: o.states.map((s) => ({ type: s.type, intensity: s.intensity })) }
            : {}),
          ...(o?.integrity !== undefined ? { integrity: o.integrity } : {}),
        };
      });
      hub.broadcastDelta({ tiles });
    }
    hub.pushFrame();
  }, 200);

  const shutdown = async () => {
    clearInterval(timer);
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
