/**
 * Ponte entre grid vivo e alvos reativos. R-015, R-049.
 *
 * O substrato fala em ReactiveTarget; o mundo guarda camadas + overlay.
 * Esta ponte mantém um proxy por célula com o mesmo array de estados do
 * overlay — mutar no substrato é mutar o save.
 */

import type { Simulation } from '../state/index.js';
import type { TransientState } from '../types/domain.js';
import type { World } from '../world/grid.js';
import type { ReactiveTarget } from './target.js';

export function tileTargetId(gridId: string, x: number, y: number): string {
  return `tile:${gridId}:${x},${y}`;
}

/** Implementa a WorldView do substrato sem importar o módulo raiz (evita ciclo). */
export class TileReactiveBridge {
  readonly #sim: Simulation;
  readonly #world: World;
  readonly #targets = new Map<string, ReactiveTarget>();
  readonly ambientDefault: number;

  constructor(sim: Simulation, world: World, ambientDefault = 20) {
    this.#sim = sim;
    this.#world = world;
    this.ambientDefault = ambientDefault;
  }

  targetAt(gridId: string, x: number, y: number): ReactiveTarget {
    const id = tileTargetId(gridId, x, y);
    let t = this.#targets.get(id);
    const tile = this.#world.tileAt(gridId, x, y);
    const overlay = this.#sim.overlayAt(gridId, x, y, true);
    if (!overlay.states) overlay.states = [];
    if (overlay.integrity === undefined) overlay.integrity = 100;

    if (!t) {
      t = {
        id,
        kind: 'tile',
        gridId,
        x,
        y,
        materialId: tile.materialId,
        states: overlay.states,
        integrity: overlay.integrity,
        ...(overlay.temperature !== undefined ? { temperature: overlay.temperature } : {}),
      };
      this.#targets.set(id, t);
    } else {
      t.materialId = tile.materialId;
      t.states = overlay.states;
      t.integrity = overlay.integrity;
      if (overlay.temperature !== undefined) t.temperature = overlay.temperature;
      else delete t.temperature;
    }
    return t;
  }

  neighborsOf(target: ReactiveTarget): ReactiveTarget[] {
    if (target.gridId === undefined || target.x === undefined || target.y === undefined) return [];
    return this.#world
      .neighbors4(target.gridId, target.x, target.y)
      .map((p) => this.targetAt(target.gridId!, p.x, p.y));
  }

  occupantsOf(_target: ReactiveTarget): ReactiveTarget[] {
    return [];
  }

  ambientTemperature(_target: ReactiveTarget): number {
    return this.ambientDefault;
  }

  /**
   * Espelha mutações do substrato de volta às camadas densas / overlay.
   * Devolve células que mudaram estado visualmente (para world.delta).
   */
  commit(): { x: number; y: number; gridId: string }[] {
    const dirty: { x: number; y: number; gridId: string }[] = [];
    for (const t of this.#targets.values()) {
      if (t.gridId === undefined || t.x === undefined || t.y === undefined) continue;
      const overlay = this.#sim.overlayAt(t.gridId, t.x, t.y, true);
      const before = fingerprint(overlay.states, overlay.integrity, overlay.temperature, t.materialId);

      overlay.states = t.states;
      if (t.integrity !== undefined) overlay.integrity = t.integrity;
      if (t.temperature !== undefined) overlay.temperature = t.temperature;
      else delete overlay.temperature;

      const tile = this.#world.tileAt(t.gridId, t.x, t.y);
      if (tile.materialId !== t.materialId) {
        this.#world.setMaterial(t.gridId, t.x, t.y, t.materialId);
      }

      const after = fingerprint(overlay.states, overlay.integrity, overlay.temperature, t.materialId);
      if (before !== after) dirty.push({ gridId: t.gridId, x: t.x, y: t.y });
    }
    return dirty;
  }

  burningCount(): number {
    let n = 0;
    for (const t of this.#targets.values()) {
      if (t.states.some((s) => s.type === 'burning' && s.intensity > 0)) n += 1;
    }
    return n;
  }
}

function fingerprint(
  states: TransientState[] | undefined,
  integrity: number | undefined,
  temperature: number | undefined,
  materialId: string,
): string {
  return JSON.stringify({ states: states ?? [], integrity, temperature, materialId });
}
