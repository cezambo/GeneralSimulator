/**
 * Colhedor de percepção a partir do mundo vivo — cone + LoS (+ audição).
 *
 * Produz fatos em prosa (A-031/A-033) e um resumo estruturado para a UI
 * (`req.agent.perception`). Nenhuma LLM no caminho.
 */

import type { Simulation } from '../state/index.js';
import {
  canHear,
  canSee,
  DEFAULT_VISION_TUNING,
  type Observer,
  type VisionTuning,
} from '../spatial/vision.js';
import type { Agent, PerceptibleFact, WorldObject } from '../types/domain.js';
import type { World } from '../world/grid.js';
import { cellOf, metersToTiles, tilesToMeters } from '../world/scale.js';
import { describeTileLook } from './tile-look.js';

const HOT_C = 55;

export type NotableKind = 'burning' | 'smoky' | 'wet' | 'hot' | 'door';

export interface VisibleTileSummary {
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly materialId: string;
  readonly look?: string;
}

export interface VisibleAgentSummary {
  readonly id: string;
  readonly name: string;
  readonly pos: { x: number; y: number };
}

export interface VisibleObjectSummary {
  readonly id: string;
  readonly defId: string;
  readonly pos: { x: number; y: number };
}

export interface NotableStateSummary {
  readonly kind: NotableKind;
  readonly x: number;
  readonly y: number;
  readonly intensity?: number;
  readonly temperature?: number;
  readonly isOpen?: boolean;
}

export interface TemperatureHook {
  readonly atAgent?: number;
  readonly nearby: readonly { x: number; y: number; temperature: number }[];
}

export interface SmellHook {
  readonly nearby: readonly {
    readonly odor: string;
    readonly sourceKind: 'agent' | 'object' | 'tile';
    readonly sourceId?: string;
    readonly x?: number;
    readonly y?: number;
  }[];
}

export interface PerceptionScanResult {
  readonly agentId: string;
  readonly facingDeg: number;
  readonly vision: { angle: number; range: number };
  readonly ranges: {
    visionTiles: number;
    visionMeters: number;
    hearingMeters: number;
  };
  readonly facts: readonly PerceptibleFact[];
  readonly visibleTiles: readonly VisibleTileSummary[];
  readonly visibleAgents: readonly VisibleAgentSummary[];
  readonly visibleObjects: readonly VisibleObjectSummary[];
  readonly notable: readonly NotableStateSummary[];
  readonly temperature: TemperatureHook;
  readonly smell: SmellHook;
}

/** Payload de `res.agent.perception` / campo `perception` em `res.agent.detail`. */
export interface AgentPerceptionPayload {
  readonly agentId: string;
  readonly facingDeg: number;
  readonly vision: { angle: number; range: number };
  readonly ranges: {
    visionTiles: number;
    visionMeters: number;
    hearingMeters: number;
  };
  readonly report: string;
  readonly estimatedTokens: number;
  readonly included: readonly PerceptibleFact[];
  readonly droppedCount: number;
  readonly visible: {
    readonly tiles: readonly VisibleTileSummary[];
    readonly agents: readonly VisibleAgentSummary[];
    readonly objects: readonly VisibleObjectSummary[];
  };
  readonly notable: readonly NotableStateSummary[];
  readonly temperature: TemperatureHook;
  readonly smell: SmellHook;
}

export interface ScanOptions {
  readonly sim: Simulation;
  readonly world: World;
  readonly agent: Agent;
  readonly gridId: string;
  readonly tuning?: VisionTuning;
}

function observerOf(
  agent: Agent,
  gridId: string,
  tuning: VisionTuning,
  world: World,
): {
  observer: Observer;
  angle: number;
  rangeTiles: number;
  rangeMeters: number;
  hearingMeters: number;
} {
  const scale = world.scale;
  const angle = agent.vision?.angle ?? tuning.coneAngleDeg;
  const rangeTiles =
    agent.vision?.range ?? metersToTiles(tuning.visionRangeMeters, scale);
  const rangeMeters = tilesToMeters(rangeTiles, scale);
  const hearingMeters = agent.hearingRange ?? tuning.hearingRangeMeters;
  return {
    observer: {
      gridId,
      x: agent.pos.x,
      y: agent.pos.y,
      rotationDeg: agent.rotation,
      visionAngleDeg: angle,
      visionRangeMeters: rangeMeters,
      hearingRangeMeters: hearingMeters,
    },
    angle,
    rangeTiles,
    rangeMeters,
    hearingMeters,
  };
}

function objectLabel(defId: string): string {
  const raw = defId.replace(/_/g, ' ');
  if (raw.startsWith('cadeira')) return `uma ${raw}`;
  if (raw.startsWith('mesa')) return `uma ${raw}`;
  if (raw.startsWith('cama')) return `uma ${raw}`;
  if (raw.startsWith('banco')) return `um ${raw}`;
  return raw;
}

function intensityOf(
  states: readonly { type: string; intensity: number }[] | undefined,
  type: string,
): number | undefined {
  if (!states) return undefined;
  let max: number | undefined;
  for (const s of states) {
    if (s.type !== type || s.intensity <= 0) continue;
    max = max === undefined ? s.intensity : Math.max(max, s.intensity);
  }
  return max;
}

function burningPhrase(intensity: number): string {
  if (intensity >= 70) return 'em chamas';
  if (intensity >= 35) return 'queimando';
  return 'chamejando fraco';
}

function wetPhrase(intensity: number): string {
  if (intensity >= 70) return 'encharcado';
  if (intensity >= 35) return 'molhado';
  return 'húmido';
}

function smokyPhrase(intensity: number): string {
  if (intensity >= 70) return 'fumo denso';
  if (intensity >= 35) return 'fumegante';
  return 'neblina de fumo';
}

function hotPhrase(temperature: number): string {
  if (temperature >= 250) return 'ardente';
  if (temperature >= 120) return 'muito quente';
  if (temperature >= HOT_C) return 'quente';
  return 'morno';
}

/**
 * Varre o grid no alcance do cone e colhe fatos + resumo para UI.
 */
export function scanWorldForAgent(opts: ScanOptions): PerceptionScanResult {
  const tuning = opts.tuning ?? DEFAULT_VISION_TUNING;
  const { sim, world, agent, gridId } = opts;
  const { observer, angle, rangeTiles, rangeMeters, hearingMeters } = observerOf(
    agent,
    gridId,
    tuning,
    world,
  );
  const scale = world.scale;
  const grid = world.grid(gridId);
  const facts: PerceptibleFact[] = [];
  const visibleTiles: VisibleTileSummary[] = [];
  const visibleAgents: VisibleAgentSummary[] = [];
  const visibleObjects: VisibleObjectSummary[] = [];
  const notable: NotableStateSummary[] = [];
  const tempNearby: { x: number; y: number; temperature: number }[] = [];
  const smellNearby: SmellHook['nearby'][number][] = [];

  const selfCell = cellOf(agent.pos.x, agent.pos.y);
  const selfOverlay = sim.overlayAt(gridId, selfCell.x, selfCell.y);
  const atAgentTemp = selfOverlay?.temperature;

  const rCeil = Math.ceil(rangeTiles);
  const x0 = Math.max(0, selfCell.x - rCeil);
  const x1 = Math.min(grid.width - 1, selfCell.x + rCeil);
  const y0 = Math.max(0, selfCell.y - rCeil);
  const y1 = Math.min(grid.height - 1, selfCell.y + rCeil);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const target = { gridId, x: x + 0.5, y: y + 0.5 };
      if (!canSee(world, observer, target, tuning, scale)) continue;

      const tile = world.tileAt(gridId, x, y);
      const overlay = sim.overlayAt(gridId, x, y);
      const states = overlay?.states ?? tile.states ?? [];
      const temperature = overlay?.temperature ?? tile.temperature;
      const burning = intensityOf(states, 'burning');
      const smoky = intensityOf(states, 'smoky');
      const wet = intensityOf(states, 'wet');
      const isDoor = tile.type === 'door';
      const isHot = temperature !== undefined && temperature >= HOT_C;
      const interesting =
        isDoor ||
        tile.type === 'wall' ||
        tile.type === 'window' ||
        burning !== undefined ||
        smoky !== undefined ||
        wet !== undefined ||
        isHot;

      if (interesting) {
        const look = describeTileLook({
          type: tile.type,
          materialId: tile.materialId,
          states: states.map((s) => ({ type: s.type, intensity: s.intensity })),
          ...(tile.integrity !== undefined
            ? { integrity: tile.integrity }
            : overlay?.integrity !== undefined
              ? { integrity: overlay.integrity }
              : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(tile.state && Object.keys(tile.state).length > 0 ? { state: { ...tile.state } } : {}),
        });
        visibleTiles.push({
          x,
          y,
          type: tile.type,
          materialId: tile.materialId,
          look,
        });
      }

      if (burning !== undefined) {
        notable.push({ kind: 'burning', x, y, intensity: burning });
        facts.push({
          text: `Há algo ${burningPhrase(burning)} à vista`,
          salienceTier: 1,
          sense: 'sight',
          subjectKind: 'tile',
          sourceId: `tile:${gridId}:${x}:${y}:burning`,
        });
      }
      if (smoky !== undefined) {
        notable.push({ kind: 'smoky', x, y, intensity: smoky });
        facts.push({
          text: `O ar está ${smokyPhrase(smoky)}`,
          salienceTier: 5,
          sense: 'sight',
          subjectKind: 'tile',
          sourceId: `tile:${gridId}:${x}:${y}:smoky`,
        });
      }
      if (wet !== undefined) {
        notable.push({ kind: 'wet', x, y, intensity: wet });
        facts.push({
          text: `O chão está ${wetPhrase(wet)}`,
          salienceTier: 5,
          sense: 'sight',
          subjectKind: 'tile',
          sourceId: `tile:${gridId}:${x}:${y}:wet`,
        });
      }
      if (isHot && temperature !== undefined) {
        notable.push({ kind: 'hot', x, y, temperature });
        tempNearby.push({ x, y, temperature });
        if (burning === undefined) {
          facts.push({
            text: `Há uma superfície ${hotPhrase(temperature)}`,
            salienceTier: temperature >= 120 ? 1 : 5,
            sense: 'sight',
            subjectKind: 'tile',
            sourceId: `tile:${gridId}:${x}:${y}:hot`,
          });
        }
      }
      if (isDoor) {
        const isOpen = Boolean(tile.state?.isOpen);
        notable.push({ kind: 'door', x, y, isOpen });
        facts.push({
          text: isOpen ? 'Uma porta aberta está à vista' : 'Uma porta fechada está à vista',
          salienceTier: 6,
          sense: 'sight',
          subjectKind: 'tile',
          sourceId: `tile:${gridId}:${x}:${y}:door`,
        });
      }

      const odor = (tile as { odorDescriptor?: string }).odorDescriptor;
      if (odor) {
        smellNearby.push({ odor, sourceKind: 'tile', x, y });
        facts.push({
          text: `Cheira a ${odor}`,
          salienceTier: 5,
          sense: 'smell',
          subjectKind: 'tile',
          sourceId: `tile:${gridId}:${x}:${y}:odor`,
        });
      }
    }
  }

  for (const other of Object.values(sim.state.agents)) {
    if (other.id === agent.id) continue;
    const target = { gridId, x: other.pos.x, y: other.pos.y };
    const seen = canSee(world, observer, target, tuning, scale);
    if (seen) {
      visibleAgents.push({
        id: other.id,
        name: other.name,
        pos: { x: other.pos.x, y: other.pos.y },
      });
      facts.push({
        text: `${other.name} está à vista`,
        salienceTier: 2,
        sense: 'sight',
        subjectKind: 'agent',
        sourceId: other.id,
      });
      if (other.odorDescriptor) {
        smellNearby.push({
          odor: other.odorDescriptor,
          sourceKind: 'agent',
          sourceId: other.id,
          x: Math.floor(other.pos.x),
          y: Math.floor(other.pos.y),
        });
        facts.push({
          text: `Cheira a ${other.odorDescriptor}`,
          salienceTier: 5,
          sense: 'smell',
          subjectKind: 'agent',
          sourceId: `${other.id}:odor`,
        });
      }
    } else if (canHear(observer, target, tuning, scale)) {
      facts.push({
        text: 'Ouve alguém por perto',
        salienceTier: 2,
        sense: 'hearing',
        subjectKind: 'agent',
        sourceId: other.id,
      });
    }
  }

  for (const obj of Object.values(sim.state.objects) as WorldObject[]) {
    if (obj.containedBy) continue;
    const objGrid = obj.gridId ?? world.mainGridId;
    if (objGrid !== gridId) continue;
    const target = { gridId: objGrid, x: obj.pos.x, y: obj.pos.y };
    if (!canSee(world, observer, target, tuning, scale)) continue;
    visibleObjects.push({
      id: obj.id,
      defId: obj.defId,
      pos: { x: obj.pos.x, y: obj.pos.y },
    });
    facts.push({
      text: `Há ${objectLabel(obj.defId)} à vista`,
      salienceTier: 4,
      sense: 'sight',
      subjectKind: 'object',
      sourceId: obj.id,
    });
    if (obj.odorDescriptor) {
      smellNearby.push({
        odor: obj.odorDescriptor,
        sourceKind: 'object',
        sourceId: obj.id,
        x: Math.floor(obj.pos.x),
        y: Math.floor(obj.pos.y),
      });
    }
    const objBurn = intensityOf(obj.states, 'burning');
    if (objBurn !== undefined) {
      facts.push({
        text: `Algo ${burningPhrase(objBurn)} entre os móveis`,
        salienceTier: 1,
        sense: 'sight',
        subjectKind: 'object',
        sourceId: `${obj.id}:burning`,
      });
    }
  }

  const seenIds = new Set<string>();
  const dedupedFacts = facts.filter((f) => {
    const key = f.sourceId ?? f.text;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  return {
    agentId: agent.id,
    facingDeg: agent.rotation,
    vision: { angle, range: rangeTiles },
    ranges: {
      visionTiles: rangeTiles,
      visionMeters: rangeMeters,
      hearingMeters,
    },
    facts: dedupedFacts,
    visibleTiles,
    visibleAgents,
    visibleObjects,
    notable,
    temperature: {
      ...(atAgentTemp !== undefined ? { atAgent: atAgentTemp } : {}),
      nearby: tempNearby,
    },
    smell: { nearby: smellNearby },
  };
}
