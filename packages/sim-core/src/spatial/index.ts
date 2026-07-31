/**
 * Espaço: índice, visão, caminho e movimento. A-005–A-011, W-048–W-050.
 */

export { SpatialIndex, type SpatialEntity } from './index-grid.js';
export {
  DEFAULT_VISION_TUNING,
  angleDeltaDeg,
  bearingDeg,
  canHear,
  canSee,
  cellsOnLine,
  distanceMeters,
  distanceTiles,
  hasLineOfSight,
  inInteractionRange,
  inVisionCone,
  type Observer,
  type Point,
  type VisionTuning,
} from './vision.js';
export {
  defaultTileCost,
  findPath,
  type FindPathOptions,
  type PathNode,
  type PathResult,
  type TileCostFn,
} from './pathfind.js';
export {
  DEFAULT_MOVEMENT_TUNING,
  advance,
  clearPath,
  createMover,
  isMoving,
  moverCell,
  setPath,
  setRotation,
  tilesPerMinute,
  type MovementTuning,
  type MoverState,
} from './movement.js';
