/**
 * Montagem de world.snapshot a partir do estado vivo.
 */

import type { Simulation } from '../state/index.js';
import type { World } from '../world/grid.js';
import type { SimClock } from '../world/clock.js';
import type {
  AgentVisible,
  ClockPayload,
  SimMode,
  TileCellSnapshot,
  WorldSnapshotPayload,
} from './types.js';

export function clockPayload(clock: SimClock): ClockPayload {
  return {
    simTime: clock.simTime,
    speed: clock.speed,
    paused: clock.paused,
    day: clock.day,
    season: clock.season,
    year: clock.year,
  };
}

export function buildWorldSnapshot(
  sim: Simulation,
  world: World,
  clock: SimClock,
  mode: SimMode = 'normal',
): WorldSnapshotPayload {
  const grid = world.grid(world.mainGridId);
  const tiles: TileCellSnapshot[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const t = world.tileAt(grid.id, x, y);
      const cell: TileCellSnapshot = {
        x,
        y,
        type: t.type,
        materialId: t.materialId,
      };
      if (t.state && Object.keys(t.state).length > 0) {
        tiles.push({ ...cell, state: { ...t.state } });
      } else {
        tiles.push(cell);
      }
    }
  }

  const objects = Object.values(sim.state.objects).map((o) => ({
    id: o.id,
    defId: o.defId,
    pos: { x: o.pos.x, y: o.pos.y },
    ...(o.rotation !== undefined ? { rotation: o.rotation } : {}),
  }));

  const agents: AgentVisible[] = Object.values(sim.state.agents).map((a) => ({
    id: a.id,
    name: a.name,
    pos: { x: a.pos.x, y: a.pos.y },
    rot: a.rotation,
    vision: {
      angle: a.vision?.angle ?? 120,
      range: a.vision?.range ?? 8,
    },
  }));

  return {
    gridId: grid.id,
    width: grid.width,
    height: grid.height,
    metersPerTile: world.scale.metersPerTile,
    mode,
    clock: clockPayload(clock),
    tiles,
    objects,
    agents,
  };
}

export function agentsUpdatePayload(sim: Simulation): { agents: AgentVisible[] } {
  return {
    agents: Object.values(sim.state.agents).map((a) => ({
      id: a.id,
      name: a.name,
      pos: { x: a.pos.x, y: a.pos.y },
      rot: a.rotation,
    })),
  };
}
