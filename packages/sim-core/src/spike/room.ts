/**
 * Sala fake 5×5 do spike V0. Descartável — não é worldgen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from '../config/paths.js';
import type { SimConfig } from '../config/load.js';
import { Simulation } from '../state/index.js';
import type { Agent, WorldObject } from '../types/domain.js';
import { World } from '../world/grid.js';

export const SPIKE_GRID = 'sala';
export const CHAIR_ID = 'obj_cadeira_1';

/** Interior transitável: (1..3)×(1..3). Borda é parede; (2,0) é porta. */
export function buildSpikeRoom(cfg: SimConfig, seed: string): { sim: Simulation; world: World } {
  const sim = Simulation.create({
    seed,
    preset: cfg.models.activePreset,
    configFingerprint: cfg.fingerprint,
    scenarioName: 'spike-v0-sala-5x5',
    mainGrid: {
      id: SPIKE_GRID,
      width: 5,
      height: 5,
      defaultType: 'floor',
      defaultMaterialId: 'pinho',
    },
  });

  const world = new World({
    sim,
    scale: { metersPerTile: cfg.tuning.metersPerTile },
  });

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const borda = x === 0 || y === 0 || x === 4 || y === 4;
      if (x === 2 && y === 0) {
        world.setType(SPIKE_GRID, x, y, 'door');
        world.setMaterial(SPIKE_GRID, x, y, 'pinho');
        world.openDoor(SPIKE_GRID, x, y);
      } else if (borda) {
        world.setType(SPIKE_GRID, x, y, 'wall');
        world.setMaterial(SPIKE_GRID, x, y, 'pedra');
      } else {
        world.setType(SPIKE_GRID, x, y, 'floor');
        world.setMaterial(SPIKE_GRID, x, y, 'pinho');
      }
    }
  }

  const cadeira: WorldObject = {
    id: CHAIR_ID,
    defId: 'cadeira_madeira',
    pos: { x: 2.5, y: 2.5 },
    gridId: SPIKE_GRID,
    integrity: 1,
  };
  sim.state.objects[CHAIR_ID] = cadeira;

  return { sim, world };
}

export function loadSpikeAgents(): { lia: Agent; rui: Agent } {
  const lia = JSON.parse(readFileSync(join(CONFIG_DIR, 'fixtures', 'agent_lia.json'), 'utf8')) as Agent;
  const rui = JSON.parse(readFileSync(join(CONFIG_DIR, 'fixtures', 'agent_rui.json'), 'utf8')) as Agent;
  // Fixtures nascem num mapa maior; a sala 5×5 exige reposicionar.
  lia.pos = { x: 1.5, y: 1.5 };
  lia.rotation = 90;
  rui.pos = { x: 3.5, y: 3.5 };
  rui.rotation = 270;
  lia.memories ??= [];
  rui.memories ??= [];
  lia.activityLog ??= [];
  rui.activityLog ??= [];
  return { lia, rui };
}
