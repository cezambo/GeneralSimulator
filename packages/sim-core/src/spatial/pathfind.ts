/**
 * A* sobre o grid. W-048, W-049.
 *
 * A busca respeita bloqueio e estado de tile (porta fechada = muro). Custo por
 * tipo: estrada barata, água cara, chamas caríssimas — o agente evita fogo por
 * preço, não por regra especial.
 */

import type { World } from '../world/grid.js';
import type { TileType } from '../types/domain.js';

export interface PathNode {
  readonly gridId: string;
  readonly x: number;
  readonly y: number;
}

export interface PathResult {
  readonly found: boolean;
  readonly path: PathNode[];
  readonly cost: number;
}

export type TileCostFn = (world: World, gridId: string, x: number, y: number) => number;

/** Custos padrão. W-049. `Infinity` = intransponível. */
export function defaultTileCost(world: World, gridId: string, x: number, y: number): number {
  if (world.blocksMovementAt(gridId, x, y)) return Infinity;
  const tile = world.tileAt(gridId, x, y);
  let cost = baseCost(tile.type);
  if (tile.states?.some((s) => s.type === 'burning' && s.intensity > 0)) cost += 20;
  return cost;
}

function baseCost(type: TileType): number {
  switch (type) {
    case 'road':
      return 0.5;
    case 'water':
      return 3;
    case 'floor':
    case 'door':
    case 'roof':
      return 1;
    default:
      return 1;
  }
}

export interface FindPathOptions {
  readonly cost?: TileCostFn;
  /** 4 = só ortogonal; 8 = com diagonais (custo √2). */
  readonly connectivity?: 4 | 8;
  readonly maxExpanded?: number;
}

const ORTHO = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

const DIAG = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
] as const;

/**
 * A* de célula a célula num único grid. W-048.
 *
 * Travessias entre grids (escada) entram depois como arestas explícitas; o
 * núcleo da busca permanece por grid, que é a unidade de escopo de W-059.
 */
export function findPath(
  world: World,
  start: PathNode,
  goal: PathNode,
  options: FindPathOptions = {},
): PathResult {
  if (start.gridId !== goal.gridId) {
    return { found: false, path: [], cost: Infinity };
  }
  const gridId = start.gridId;
  if (!world.inBounds(gridId, start.x, start.y) || !world.inBounds(gridId, goal.x, goal.y)) {
    return { found: false, path: [], cost: Infinity };
  }
  if (start.x === goal.x && start.y === goal.y) {
    return { found: true, path: [start], cost: 0 };
  }

  const costOf = options.cost ?? defaultTileCost;
  if (costOf(world, gridId, goal.x, goal.y) === Infinity) {
    return { found: false, path: [], cost: Infinity };
  }

  const connectivity = options.connectivity ?? 8;
  const maxExpanded = options.maxExpanded ?? 50_000;
  const deltas = connectivity === 8 ? [...ORTHO, ...DIAG] : [...ORTHO];

  const key = (x: number, y: number) => `${x},${y}`;
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const open = new MinHeap<{ k: string; x: number; y: number; f: number }>((a, b) =>
    a.f !== b.f ? a.f - b.f : a.k.localeCompare(b.k),
  );

  const startK = key(start.x, start.y);
  gScore.set(startK, 0);
  open.push({ k: startK, x: start.x, y: start.y, f: heuristic(start.x, start.y, goal.x, goal.y) });

  const closed = new Set<string>();
  let expanded = 0;

  while (!open.empty()) {
    const cur = open.pop()!;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    expanded += 1;
    if (expanded > maxExpanded) break;

    if (cur.x === goal.x && cur.y === goal.y) {
      return {
        found: true,
        path: reconstruct(cameFrom, cur.k, gridId),
        cost: gScore.get(cur.k)!,
      };
    }

    const gCur = gScore.get(cur.k)!;
    for (const d of deltas) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (!world.inBounds(gridId, nx, ny)) continue;

      // Diagonal: os dois ortogonais adjacentes precisam ser transitáveis,
      // senão o caminho “corta o canto” de uma parede.
      if (d.x !== 0 && d.y !== 0) {
        if (world.blocksMovementAt(gridId, cur.x + d.x, cur.y)) continue;
        if (world.blocksMovementAt(gridId, cur.x, cur.y + d.y)) continue;
      }

      const step = costOf(world, gridId, nx, ny);
      if (step === Infinity) continue;
      const stepCost = d.x !== 0 && d.y !== 0 ? step * Math.SQRT2 : step;
      const nk = key(nx, ny);
      const tentative = gCur + stepCost;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, cur.k);
      gScore.set(nk, tentative);
      open.push({
        k: nk,
        x: nx,
        y: ny,
        f: tentative + heuristic(nx, ny, goal.x, goal.y),
      });
    }
  }

  return { found: false, path: [], cost: Infinity };
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  // Octile: admissível com movimento 8-conectado e custo √2 na diagonal.
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function reconstruct(cameFrom: Map<string, string>, end: string, gridId: string): PathNode[] {
  const path: PathNode[] = [];
  let cur: string | undefined = end;
  while (cur) {
    const [xs, ys] = cur.split(',');
    path.push({ gridId, x: Number(xs), y: Number(ys) });
    cur = cameFrom.get(cur);
  }
  path.reverse();
  return path;
}

/** Heap binário mínimo. Empate por chave string para ordem estável. */
class MinHeap<T> {
  readonly #data: T[] = [];
  readonly #cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number) {
    this.#cmp = cmp;
  }

  empty(): boolean {
    return this.#data.length === 0;
  }

  push(item: T): void {
    this.#data.push(item);
    this.#siftUp(this.#data.length - 1);
  }

  pop(): T | undefined {
    if (this.#data.length === 0) return undefined;
    const top = this.#data[0]!;
    const last = this.#data.pop()!;
    if (this.#data.length > 0) {
      this.#data[0] = last;
      this.#siftDown(0);
    }
    return top;
  }

  #siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#cmp(this.#data[i]!, this.#data[p]!) >= 0) break;
      [this.#data[i], this.#data[p]] = [this.#data[p]!, this.#data[i]!];
      i = p;
    }
  }

  #siftDown(i: number): void {
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < this.#data.length && this.#cmp(this.#data[l]!, this.#data[best]!) < 0) best = l;
      if (r < this.#data.length && this.#cmp(this.#data[r]!, this.#data[best]!) < 0) best = r;
      if (best === i) break;
      [this.#data[i], this.#data[best]] = [this.#data[best]!, this.#data[i]!];
      i = best;
    }
  }
}
