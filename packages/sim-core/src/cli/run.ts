/**
 * Entrada CLI do sim-core. X-001.
 *
 * Uso:
 *   npm run sim -- spike
 *   npm run sim -- serve
 */

import { loadConfig } from '../config/index.js';
import { ProtocolHub, startProtocolServer, DEFAULT_PORT } from '../protocol/index.js';
import { runSpike } from '../spike/index.js';
import { buildSpikeRoom, loadSpikeAgents } from '../spike/room.js';
import { SimClock } from '../world/clock.js';

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

  console.error(`comando desconhecido: ${cmd}. Disponível: spike, serve`);
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

  const hub = new ProtocolHub({ sim, world, clock });
  const port = Number(process.env['SIM_PORT'] ?? DEFAULT_PORT);
  const server = await startProtocolServer({ hub, port, host: '127.0.0.1' });

  console.log(JSON.stringify({ listening: `ws://127.0.0.1:${server.port}`, clients: 0 }));

  // Laço mínimo: avança o relógio e empurra frame enquanto houver velocidade.
  const timer = setInterval(() => {
    if (!clock.paused && clock.speed > 0) {
      clock.tick();
      hub.pushFrame();
    }
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
