/**
 * Tipos do protocolo núcleo ↔ clientes. 05-PROTOCOLO.md, X-007.
 *
 * Schemas JSON do envelope ainda não existem em `schemas/` — a validação aqui
 * é estrutural e suficiente para o servidor rejeitar cliente incompatível.
 */

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
