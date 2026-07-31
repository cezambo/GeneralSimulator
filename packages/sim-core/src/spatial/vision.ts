/**
 * Cone de visão, linha de visão e alcance de interação. A-006–A-010, W-008.
 */

import type { World } from '../world/grid.js';
import { cellOf, metersToTiles, type WorldScale } from '../world/scale.js';
import { DEFAULT_METERS_PER_TILE } from '../world/scale.js';

export interface VisionTuning {
  readonly coneAngleDeg: number;
  readonly visionRangeMeters: number;
  readonly hearingRangeMeters: number;
  readonly interactionRangeMeters: number;
}

export const DEFAULT_VISION_TUNING: VisionTuning = {
  coneAngleDeg: 110,
  visionRangeMeters: 30,
  hearingRangeMeters: 20,
  interactionRangeMeters: 1.5,
};

export interface Observer {
  readonly gridId: string;
  readonly x: number;
  readonly y: number;
  /** Orientação em graus. Independente da direção de movimento. A-006. */
  readonly rotationDeg: number;
  readonly visionAngleDeg?: number;
  readonly visionRangeMeters?: number;
  readonly hearingRangeMeters?: number;
}

export interface Point {
  readonly gridId: string;
  readonly x: number;
  readonly y: number;
}

/** Distância euclidiana em tiles. Grids diferentes = infinito. */
export function distanceTiles(a: Point, b: Point): number {
  if (a.gridId !== b.gridId) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function distanceMeters(a: Point, b: Point, scale: WorldScale): number {
  return distanceTiles(a, b) * scale.metersPerTile;
}

/**
 * Ângulo absoluto do vetor de A para B, em graus [0, 360).
 * Em coordenadas de tile com Y crescente para baixo no grid, o ângulo 0
 * aponta para +X (leste) e 90 para +Y (sul) — o mesmo convênio do render
 * top-down. O que importa é consistência, não bússola.
 */
export function bearingDeg(fromX: number, fromY: number, toX: number, toY: number): number {
  const rad = Math.atan2(toY - fromY, toX - fromX);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Menor diferença angular absoluta, em [0, 180]. */
export function angleDeltaDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * O alvo está dentro do cone de abertura, ignorando oclusão. A-007.
 *
 * Distância zero (sobre si) conta como visível: evita rejeitar o próprio tile.
 */
export function inVisionCone(
  observer: Observer,
  target: Point,
  tuning: VisionTuning = DEFAULT_VISION_TUNING,
  scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE },
): boolean {
  if (observer.gridId !== target.gridId) return false;
  const rangeTiles = metersToTiles(
    observer.visionRangeMeters ?? tuning.visionRangeMeters,
    scale,
  );
  const dist = distanceTiles(observer, target);
  if (dist > rangeTiles) return false;
  if (dist < 1e-9) return true;
  const abertura = observer.visionAngleDeg ?? tuning.coneAngleDeg;
  const bearing = bearingDeg(observer.x, observer.y, target.x, target.y);
  return angleDeltaDeg(observer.rotationDeg, bearing) <= abertura / 2;
}

/**
 * Linha de visão livre de oclusão por tiles. W-008, A-007.
 *
 * Percorre as células do segmento (supercover de Bresenham) e recusa se
 * alguma **entre** origem e destino bloqueia visão. A célula do observador e
 * a do alvo não ocluem — o agente vê quem está na mesma célula, e vê através
 * da própria porta aberta sob os pés.
 */
export function hasLineOfSight(world: World, from: Point, to: Point): boolean {
  if (from.gridId !== to.gridId) return false;
  const a = cellOf(from.x, from.y);
  const b = cellOf(to.x, to.y);
  if (a.x === b.x && a.y === b.y) return true;

  for (const cell of cellsOnLine(a.x, a.y, b.x, b.y)) {
    if (cell.x === a.x && cell.y === a.y) continue;
    if (cell.x === b.x && cell.y === b.y) continue;
    if (world.blocksVisionAt(from.gridId, cell.x, cell.y)) return false;
  }
  return true;
}

/** Percebe se está no cone **e** sem parede no caminho. A-007. */
export function canSee(
  world: World,
  observer: Observer,
  target: Point,
  tuning: VisionTuning = DEFAULT_VISION_TUNING,
  scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE },
): boolean {
  return inVisionCone(observer, target, tuning, scale) && hasLineOfSight(world, observer, target);
}

/** Raio circular, sem oclusão direcional. A-009. */
export function canHear(
  observer: Observer,
  target: Point,
  tuning: VisionTuning = DEFAULT_VISION_TUNING,
  scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE },
): boolean {
  if (observer.gridId !== target.gridId) return false;
  const range = metersToTiles(observer.hearingRangeMeters ?? tuning.hearingRangeMeters, scale);
  return distanceTiles(observer, target) <= range;
}

/**
 * Alcance de interação. A-010.
 *
 * Ações com alcance próprio (gritar, acenar) não passam por aqui — quem
 * chama decide. Pegar objeto distante morre aqui, antes do Validador.
 */
export function inInteractionRange(
  actor: Point,
  target: Point,
  tuning: VisionTuning = DEFAULT_VISION_TUNING,
  scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE },
): boolean {
  return distanceMeters(actor, target, scale) <= tuning.interactionRangeMeters;
}

/**
 * Células tocadas pelo segmento. Inclui diagonais que o segmento atravessa
 * pelo canto — sem isso uma parede em diagonal deixaria um “vão” visual.
 */
export function cellsOnLine(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    // Ambos no mesmo passo quando o erro cruza os dois eixos: o segmento
    // passa pelo canto compartilhado pelas quatro células.
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}
