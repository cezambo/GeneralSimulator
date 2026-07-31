/**
 * Entrada CLI do sim-core. X-001.
 *
 * Uso: npm run sim -- spike
 */

import { runSpike } from '../spike/index.js';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'spike';
  if (cmd !== 'spike') {
    console.error(`comando desconhecido: ${cmd}. Disponível: spike`);
    process.exitCode = 1;
    return;
  }

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
