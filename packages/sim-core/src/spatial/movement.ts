/**
 * Movimento contínuo ao longo de um caminho. A-005, A-006, W-050.
 *
 * O núcleo guarda trajetória + velocidade; o cliente interpola. Rotação é
 * independente da direção de deslocamento: virar para olhar não move.
 */

import { cellOf, metersToTiles, type WorldScale } from '../world/scale.js';
import { DEFAULT_METERS_PER_TILE } from '../world/scale.js';
import type { PathNode } from './pathfind.js';

export interface MovementTuning {
  readonly baseSpeedMetersPerSecond: number;
  readonly minSpeedFactor: number;
}

export const DEFAULT_MOVEMENT_TUNING: MovementTuning = {
  baseSpeedMetersPerSecond: 1.4,
  minSpeedFactor: 0.15,
};

/**
 * Velocidade em tiles por minuto simulado.
 *
 * Um tick = 1 minuto. Capacidade `moving` (0..1) escala a velocidade; o piso
 * evita que um quase-imóvel trave o pathfinding sem chegar a zero.
 */
export function tilesPerMinute(
  movingCapacity: number,
  tuning: MovementTuning = DEFAULT_MOVEMENT_TUNING,
  scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE },
): number {
  const fator = Math.max(tuning.minSpeedFactor, Math.min(1, movingCapacity));
  const metrosPorMinuto = tuning.baseSpeedMetersPerSecond * 60 * fator;
  return metersToTiles(metrosPorMinuto, scale);
}

export interface MoverState {
  gridId: string;
  x: number;
  y: number;
  /** Graus. Independente da direção de movimento. A-006. */
  rotationDeg: number;
  /** Índice do próximo waypoint no caminho, ou -1 se parado. */
  waypointIndex: number;
  path: PathNode[];
  /** Tiles por minuto simulado. */
  speed: number;
}

export function createMover(
  gridId: string,
  x: number,
  y: number,
  rotationDeg = 0,
): MoverState {
  return { gridId, x, y, rotationDeg, waypointIndex: -1, path: [], speed: 0 };
}

/** Só gira. A posição não muda. A-006. */
export function setRotation(mover: MoverState, degrees: number): void {
  mover.rotationDeg = ((degrees % 360) + 360) % 360;
}

/**
 * Substitui o caminho. Waypoints são centros de célula (x+0.5, y+0.5).
 * W-050: o plano é a trajetória, não um salto de posição.
 */
export function setPath(mover: MoverState, path: readonly PathNode[], speed: number): void {
  mover.path = path.map((p) => ({ ...p }));
  mover.speed = speed;
  mover.waypointIndex = path.length > 0 ? 0 : -1;
  if (path[0] && path[0].gridId !== mover.gridId) {
    mover.gridId = path[0].gridId;
  }
}

export function clearPath(mover: MoverState): void {
  mover.path = [];
  mover.waypointIndex = -1;
}

export function isMoving(mover: MoverState): boolean {
  return mover.waypointIndex >= 0 && mover.waypointIndex < mover.path.length;
}

/**
 * Avança `minutes` de tempo simulado ao longo do caminho. A-005.
 *
 * Não altera `rotationDeg` — olhar e andar são eixos separados. Quem quiser
 * o agente “olhando para onde anda” chama `setRotation` à parte.
 */
export function advance(mover: MoverState, minutes: number): void {
  if (!isMoving(mover) || minutes <= 0 || mover.speed <= 0) return;
  let remaining = mover.speed * minutes;

  while (remaining > 0 && isMoving(mover)) {
    const wp = mover.path[mover.waypointIndex]!;
    const tx = wp.x + 0.5;
    const ty = wp.y + 0.5;
    const dx = tx - mover.x;
    const dy = ty - mover.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-9) {
      mover.waypointIndex += 1;
      continue;
    }
    if (remaining >= dist) {
      mover.x = tx;
      mover.y = ty;
      mover.gridId = wp.gridId;
      remaining -= dist;
      mover.waypointIndex += 1;
    } else {
      const t = remaining / dist;
      mover.x += dx * t;
      mover.y += dy * t;
      remaining = 0;
    }
  }

  if (!isMoving(mover)) {
    mover.path = [];
    mover.waypointIndex = -1;
  }
}

/** Célula discreta sob o mover — o que pathfinding e bloqueio consultam. */
export function moverCell(mover: MoverState): { gridId: string; x: number; y: number } {
  const c = cellOf(mover.x, mover.y);
  return { gridId: mover.gridId, x: c.x, y: c.y };
}
