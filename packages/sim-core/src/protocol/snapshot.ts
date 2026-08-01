/**
 * Montagem de world.snapshot a partir do estado vivo.
 */

import type { Simulation } from '../state/index.js';
import type { Agent } from '../types/domain.js';
import { describeTileLook } from '../perception/tile-look.js';
import type { World } from '../world/grid.js';
import type { SimClock } from '../world/clock.js';
import { isMoving, type MoverState } from '../spatial/movement.js';
import type {
  AgentVisible,
  ClockPayload,
  SimMode,
  TileCellSnapshot,
  WorldSnapshotPayload,
} from './types.js';

/** Lookup opcional de trajetória (05-PROTOCOLO §4.2). */
export type AgentMotionLookup = (agentId: string) => AgentVisible['motion'] | undefined;

/** Extrai `motion` restante de um MoverState para o cliente interpolar. */
export function motionFromMover(
  mover: MoverState,
  simTime: number,
): AgentVisible['motion'] | undefined {
  if (!isMoving(mover)) return undefined;
  const path: { x: number; y: number }[] = [];
  for (let i = mover.waypointIndex; i < mover.path.length; i += 1) {
    const n = mover.path[i]!;
    path.push({ x: n.x + 0.5, y: n.y + 0.5 });
  }
  if (path.length === 0) return undefined;
  let dist = Math.hypot(path[0]!.x - mover.x, path[0]!.y - mover.y);
  for (let i = 1; i < path.length; i += 1) {
    dist += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  const eta =
    mover.speed > 0 ? simTime + Math.ceil(dist / mover.speed) : undefined;
  return {
    path,
    speed: mover.speed,
    ...(eta !== undefined ? { etaSimTime: eta } : {}),
  };
}

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

/** Uma célula para snapshot/delta — compartilhado com paint/undo. */
export function tileCellSnapshot(
  sim: Simulation,
  world: World,
  gridId: string,
  x: number,
  y: number,
): TileCellSnapshot {
  const t = world.tileAt(gridId, x, y);
  const overlay = sim.overlayAt(gridId, x, y);
  const states =
    overlay?.states && overlay.states.length > 0
      ? overlay.states.map((s) => ({ type: s.type, intensity: s.intensity }))
      : [];
  const objects = Object.values(sim.state.objects)
    .filter((o) => Math.floor(o.pos.x) === x && Math.floor(o.pos.y) === y)
    .map((o) => ({ defId: o.defId }));
  const look = describeTileLook({
    type: t.type,
    materialId: t.materialId,
    states,
    ...(overlay?.integrity !== undefined ? { integrity: overlay.integrity } : {}),
    ...(overlay?.temperature !== undefined ? { temperature: overlay.temperature } : {}),
    ...(t.state && Object.keys(t.state).length > 0 ? { state: { ...t.state } } : {}),
    ...(objects.length > 0 ? { objects } : {}),
  });
  return {
    x,
    y,
    type: t.type,
    materialId: t.materialId,
    ...(t.state && Object.keys(t.state).length > 0 ? { state: { ...t.state } } : {}),
    states,
    ...(overlay?.integrity !== undefined ? { integrity: overlay.integrity } : {}),
    ...(overlay?.temperature !== undefined ? { temperature: overlay.temperature } : {}),
    look,
  };
}

export function buildWorldSnapshot(
  sim: Simulation,
  world: World,
  clock: SimClock,
  mode: SimMode = 'normal',
  motionOf?: AgentMotionLookup,
): WorldSnapshotPayload {
  const grid = world.grid(world.mainGridId);
  const tiles: TileCellSnapshot[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      tiles.push(tileCellSnapshot(sim, world, grid.id, x, y));
    }
  }

  const objects = Object.values(sim.state.objects).map((o) => objectVisible(o));

  const agents: AgentVisible[] = Object.values(sim.state.agents).map((a) =>
    agentVisible(a, motionOf?.(a.id)),
  );

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

export function agentsUpdatePayload(
  sim: Simulation,
  motionOf?: AgentMotionLookup,
): { agents: AgentVisible[] } {
  return {
    agents: Object.values(sim.state.agents).map((a) => agentVisible(a, motionOf?.(a.id))),
  };
}

function agentVisible(a: Agent, motion: AgentVisible['motion'] | undefined): AgentVisible {
  const base: AgentVisible = {
    id: a.id,
    name: a.name,
    pos: { x: a.pos.x, y: a.pos.y },
    rot: a.rotation,
    vision: {
      angle: a.vision?.angle ?? 120,
      range: a.vision?.range ?? 8,
    },
  };
  return motion ? { ...base, motion } : base;
}

function objectVisible(o: {
  id: string;
  defId: string;
  pos: { x: number; y: number };
  rotation?: number;
  states?: readonly { type: string; intensity: number }[];
  integrity?: number;
  temperature?: number;
}): WorldSnapshotPayload['objects'][number] {
  const states =
    o.states && o.states.length > 0
      ? o.states.map((s) => ({ type: s.type, intensity: s.intensity }))
      : undefined;
  return {
    id: o.id,
    defId: o.defId,
    pos: { x: o.pos.x, y: o.pos.y },
    ...(o.rotation !== undefined ? { rotation: o.rotation } : {}),
    ...(states ? { states } : {}),
    ...(o.integrity !== undefined ? { integrity: o.integrity } : {}),
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
  };
}
