/**
 * Tipos do protocolo núcleo ↔ clientes. 05-PROTOCOLO.md, X-007.
 *
 * Schemas JSON do envelope ainda não existem em `schemas/` — a validação aqui
 * é estrutural e suficiente para o servidor rejeitar cliente incompatível.
 */

import type { AgentPerceptionPayload as AgentPerceptionPayloadT } from '../perception/world-scan.js';
import type { Agent } from '../types/domain.js';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;

export type ClientRole = 'godot' | 'panel' | 'test';

export interface Envelope<T = unknown> {
  readonly v: number;
  readonly type: string;
  readonly seq: number;
  readonly simTime: number;
  readonly reqId?: string;
  readonly payload: T;
}

export type SimMode = 'normal' | 'construction';

export interface ClockPayload {
  readonly simTime: number;
  readonly speed: number;
  readonly paused: boolean;
  readonly day: number;
  readonly season: number;
  readonly year: number;
}

export interface AgentVisible {
  readonly id: string;
  readonly name: string;
  readonly pos: { x: number; y: number };
  readonly rot: number;
  readonly flags?: readonly string[];
  readonly vision?: { angle: number; range: number };
  readonly motion?: {
    path: readonly { x: number; y: number }[];
    speed: number;
    etaSimTime?: number;
  };
}

export interface TileCellSnapshot {
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly materialId: string;
  readonly state?: Record<string, unknown>;
  /** Estados transientes (burning, wet, …) para o cliente pintar. */
  readonly states?: readonly { type: string; intensity: number }[];
  readonly integrity?: number;
  readonly temperature?: number;
  /** O₂ local 0–100; omitido = ambiente cheio (cliente só pinta starve se vier). */
  readonly oxygen?: number;
  /** Prosa de inspeção (hover). Determinística a partir do estado da célula. */
  readonly look?: string;
}

export interface WorldSnapshotPayload {
  readonly gridId: string;
  readonly width: number;
  readonly height: number;
  readonly metersPerTile: number;
  readonly mode: SimMode;
  readonly clock: ClockPayload;
  readonly tiles: readonly TileCellSnapshot[];
  readonly objects: readonly {
    id: string;
    defId: string;
    pos: { x: number; y: number };
    rotation?: number;
    states?: readonly { type: string; intensity: number }[];
    integrity?: number;
    temperature?: number;
  }[];
  readonly agents: readonly AgentVisible[];
}

export interface WorldDeltaPayload {
  readonly tiles?: readonly TileCellSnapshot[];
  readonly objectsUpsert?: readonly WorldSnapshotPayload['objects'][number][];
  readonly objectsRemove?: readonly string[];
  readonly agents?: readonly AgentVisible[];
}

export interface ErrorPayload {
  readonly code: string;
  readonly message: string;
}

/** `req.agent.perception` — agente a inspecionar. */
export interface AgentPerceptionRequest {
  readonly agentId: string;
}

/**
 * Re-export do payload de percepção para UI (fonte: perception/world-scan).
 * Godot chama `req.agent.perception` ao seleccionar um agente.
 */
export type { AgentPerceptionPayload } from '../perception/world-scan.js';

/** `res.agent.detail` — perfil + percepção estruturada. */
export interface AgentDetailPayload {
  readonly agent: Agent;
  readonly perception: AgentPerceptionPayloadT;
}

/** `cmd.tool.apply` — ferramentas GM (água / apagar / acender / fumaça / secar). */
export interface ToolApplyPayload {
  /**
   * `wet` / `extinguish` / `ignite` / `dry` → efeitos do catálogo (reactions.json).
   * `smoke` → wrapper de protocolo: aplica estado `smoky` (não há effectId `smoke` no vocabulário).
   */
  readonly effect: 'wet' | 'extinguish' | 'ignite' | 'smoke' | 'dry';
  readonly cells: readonly { x: number; y: number }[];
  /**
   * Intensidade do efeito (0–100). Ex.: 15 molhado leve vs 90 encharcar;
   * ignite ~55–80; smoke (smoky) ~40.
   * Omitido → default do servidor (~90 em `wet`, ~40 em `smoke`, catálogo nos outros).
   */
  readonly intensity?: number;
}
