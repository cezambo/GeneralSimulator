/**
 * Sala fake do spike / demo visual. Descartável — não é worldgen.
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

/** Tamanho da sala de teste (borda = parede). Interior transitável: 12×10. */
export const SPIKE_WIDTH = 14;
export const SPIKE_HEIGHT = 12;

/** Interior transitável: (1..W-2)×(1..H-2). Porta no meio da parede norte. */
export function buildSpikeRoom(cfg: SimConfig, seed: string): { sim: Simulation; world: World } {
  const w = SPIKE_WIDTH;
  const h = SPIKE_HEIGHT;
  const doorX = Math.floor(w / 2);

  const sim = Simulation.create({
    seed,
    preset: cfg.models.activePreset,
    configFingerprint: cfg.fingerprint,
    scenarioName: `spike-sala-${w}x${h}`,
    mainGrid: {
      id: SPIKE_GRID,
      width: w,
      height: h,
      defaultType: 'floor',
      defaultMaterialId: 'pinho',
    },
  });

  const world = new World({
    sim,
    scale: { metersPerTile: cfg.tuning.metersPerTile },
  });

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const borda = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (x === doorX && y === 0) {
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

  // Centro da célula (W-002): inteiro = canto — o cliente desenha o marcador
  // centrado em `pos`, e sem +0.5 a cadeira parece fora da grelha.
  const cadeira: WorldObject = {
    id: CHAIR_ID,
    defId: 'cadeira_madeira',
    pos: { x: Math.floor(w / 2) + 0.5, y: Math.floor(h / 2) + 0.5 },
    gridId: SPIKE_GRID,
    integrity: 100,
    states: [],
  };
  sim.state.objects[CHAIR_ID] = cadeira;

  return { sim, world };
}

export function loadSpikeAgents(): { lia: Agent; rui: Agent } {
  const lia = JSON.parse(readFileSync(join(CONFIG_DIR, 'fixtures', 'agent_lia.json'), 'utf8')) as Agent;
  const rui = JSON.parse(readFileSync(join(CONFIG_DIR, 'fixtures', 'agent_rui.json'), 'utf8')) as Agent;
  // Canto SW / canto SE do interior.
  lia.pos = { x: 2.5, y: 2.5 };
  lia.rotation = 90;
  rui.pos = { x: SPIKE_WIDTH - 2.5, y: SPIKE_HEIGHT - 2.5 };
  rui.rotation = 270;
  lia.memories ??= [];
  rui.memories ??= [];
  lia.activityLog ??= [];
  rui.activityLog ??= [];
  return { lia, rui };
}
