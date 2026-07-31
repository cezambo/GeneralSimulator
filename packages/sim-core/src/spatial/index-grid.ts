/**
 * Índice espacial por grade uniforme. A-011.
 *
 * Consultas de proximidade nunca varrem todos contra todos: cada entidade
 * cai numa célula do índice, e a vizinhança é a união das células tocadas
 * pelo raio. O custo cresce com a densidade local, não com N².
 */

import { cellKey } from '../world/scale.js';

export interface SpatialEntity {
  readonly id: string;
  readonly gridId: string;
  readonly x: number;
  readonly y: number;
}

export class SpatialIndex {
  readonly cellSize: number;
  /** gridId → célula → ids */
  readonly #cells = new Map<string, Map<string, Set<string>>>();
  readonly #byId = new Map<string, SpatialEntity>();

  /**
   * `cellSize` em coordenadas de tile. 4 (= 2 m a 0,5 m/tile) é um bom
   * equilíbrio: raio de interação cabe em poucas células, e o índice não
   * explode em entradas.
   */
  constructor(cellSize = 4) {
    if (cellSize <= 0) throw new RangeError(`cellSize deve ser positivo, veio ${cellSize}`);
    this.cellSize = cellSize;
  }

  get size(): number {
    return this.#byId.size;
  }

  upsert(entity: SpatialEntity): void {
    const prev = this.#byId.get(entity.id);
    if (prev) this.#removeFromCell(prev);
    this.#byId.set(entity.id, entity);
    this.#addToCell(entity);
  }

  remove(id: string): boolean {
    const prev = this.#byId.get(id);
    if (!prev) return false;
    this.#removeFromCell(prev);
    this.#byId.delete(id);
    return true;
  }

  get(id: string): SpatialEntity | undefined {
    return this.#byId.get(id);
  }

  clear(): void {
    this.#cells.clear();
    this.#byId.clear();
  }

  /**
   * Entidades no mesmo grid a até `radius` (em tiles) do ponto.
   * Ordenadas por distância crescente, depois por id — determinismo (X-004).
   */
  queryRadius(gridId: string, x: number, y: number, radius: number): SpatialEntity[] {
    const r2 = radius * radius;
    const out: { e: SpatialEntity; d2: number }[] = [];
    for (const e of this.#candidates(gridId, x, y, radius)) {
      if (e.gridId !== gridId) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) out.push({ e, d2 });
    }
    out.sort((a, b) => a.d2 - b.d2 || a.e.id.localeCompare(b.e.id));
    return out.map((o) => o.e);
  }

  #bucket(x: number, y: number): string {
    return cellKey(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  #addToCell(e: SpatialEntity): void {
    let porGrid = this.#cells.get(e.gridId);
    if (!porGrid) {
      porGrid = new Map();
      this.#cells.set(e.gridId, porGrid);
    }
    const key = this.#bucket(e.x, e.y);
    let set = porGrid.get(key);
    if (!set) {
      set = new Set();
      porGrid.set(key, set);
    }
    set.add(e.id);
  }

  #removeFromCell(e: SpatialEntity): void {
    const porGrid = this.#cells.get(e.gridId);
    if (!porGrid) return;
    const key = this.#bucket(e.x, e.y);
    const set = porGrid.get(key);
    if (!set) return;
    set.delete(e.id);
    if (set.size === 0) porGrid.delete(key);
  }

  *#candidates(gridId: string, x: number, y: number, radius: number): Iterable<SpatialEntity> {
    const porGrid = this.#cells.get(gridId);
    if (!porGrid) return;
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        const set = porGrid.get(cellKey(cx, cy));
        if (!set) continue;
        for (const id of set) {
          const e = this.#byId.get(id);
          if (e) yield e;
        }
      }
    }
  }
}
