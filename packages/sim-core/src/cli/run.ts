/**
 * Entrada CLI do sim-core. X-001.
 *
 * Uso:
 *   npm run sim -- spike
 *   npm run sim -- serve
 *   npm run sim -- fire
 */

import { runFireDemo } from '../demo/fire.js';
import { startLiveServe } from '../demo/live-serve.js';
import { runSpike } from '../spike/index.js';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'spike';

  if (cmd === 'spike') {
    await runSpikeCmd();
    return;
  }
  if (cmd === 'serve') {
    await startLiveServe();
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

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
