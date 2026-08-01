/**
 * Pathfinding da demo ao vivo: movers evitam tiles em chamas e com fumo.
 *
 * O A* genérico só encarece fogo (+20); aqui o custo é Infinity — contorna ou
 * falha. Sem saída: o caller pausa (clearPath) e tenta de novo no próximo
 * revalidate / patrulha.
 */

import { moverCell, type MoverState } from '../spatial/movement.js';
import { defaultTileCost, type TileCostFn } from '../spatial/pathfind.js';
import type { World } from '../world/grid.js';

/** Tile com burning ativo (overlay já fundido em `tileAt`). */
export function isBurningTile(
  world: World,
  gridId: string,
  x: number,
  y: number,
): boolean {
  if (!world.inBounds(gridId, x, y)) return false;
  const tile = world.tileAt(gridId, x, y);
  return tile.states?.some((s) => s.type === 'burning' && s.intensity > 0) ?? false;
}

/** Tile com smoky ativo (overlay já fundido em `tileAt`). */
export function isSmokyTile(
  world: World,
  gridId: string,
  x: number,
  y: number,
): boolean {
  if (!world.inBounds(gridId, x, y)) return false;
  const tile = world.tileAt(gridId, x, y);
  return tile.states?.some((s) => s.type === 'smoky' && s.intensity > 0) ?? false;
}

function isHazardTile(world: World, gridId: string, x: number, y: number): boolean {
  return isBurningTile(world, gridId, x, y) || isSmokyTile(world, gridId, x, y);
}

/**
 * Custo A* da demo: muro, fogo e fumo são intransitáveis.
 * Mantém os custos de terreno do default para o resto.
 */
export const avoidBurningCost: TileCostFn = (world, gridId, x, y) => {
  if (isHazardTile(world, gridId, x, y)) return Infinity;
  return defaultTileCost(world, gridId, x, y);
};

/**
 * True se o caminho restante atravessa parede nova, fogo ou fumo.
 * Ignora a célula atual do mover — pode estar a escapar de uma chama / fumo.
 */
export function pathNeedsRepath(world: World, mover: MoverState): boolean {
  const here = moverCell(mover);
  for (let i = Math.max(0, mover.waypointIndex); i < mover.path.length; i += 1) {
    const n = mover.path[i]!;
    if (world.blocksMovementAt(n.gridId, n.x, n.y)) return true;
    const onHere = n.gridId === here.gridId && n.x === here.x && n.y === here.y;
    if (!onHere && isHazardTile(world, n.gridId, n.x, n.y)) return true;
  }
  return false;
}
