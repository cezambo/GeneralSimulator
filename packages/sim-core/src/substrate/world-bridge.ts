/**
 * Ponte entre grid vivo e alvos reativos. R-015, R-049.
 *
 * O substrato fala em ReactiveTarget; o mundo guarda camadas + overlay.
 * Esta ponte mantém um proxy por célula (e por objeto) com o mesmo array de
 * estados do overlay / WorldObject — mutar no substrato é mutar o save.
 */

import type { Simulation } from '../state/index.js';
import type { ObjectDef, TransientState, WorldObject } from '../types/domain.js';
import { blocksMovement } from '../world/tiles.js';
import type { World } from '../world/grid.js';
import type { ReactiveTarget } from './target.js';

export function tileTargetId(gridId: string, x: number, y: number): string {
  return `tile:${gridId}:${x},${y}`;
}

export function objectTargetId(objectId: string): string {
  return `object:${objectId}`;
}

export interface BridgeCommitResult {
  readonly tiles: { x: number; y: number; gridId: string }[];
  readonly objectsUpsert: {
    id: string;
    defId: string;
    pos: { x: number; y: number };
    rotation?: number;
    states?: { type: string; intensity: number }[];
    integrity?: number;
    temperature?: number;
  }[];
  readonly objectsRemove: string[];
}

/** Implementa a WorldView do substrato sem importar o módulo raiz (evita ciclo). */
export class TileReactiveBridge {
  readonly #sim: Simulation;
  readonly #world: World;
  readonly #objects: ReadonlyMap<string, ObjectDef> | undefined;
  readonly #targets = new Map<string, ReactiveTarget>();
  readonly ambientDefault: number;

  constructor(
    sim: Simulation,
    world: World,
    ambientDefault = 20,
    objects?: ReadonlyMap<string, ObjectDef>,
  ) {
    this.#sim = sim;
    this.#world = world;
    this.ambientDefault = ambientDefault;
    this.#objects = objects;
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
      // Material denso pode mudar por fora (construção).
      t.materialId = tile.materialId;
      if (t.states !== overlay.states) {
        // Array divergiu: construção (ou invalidate) trocou o overlay. Seguir
        // o overlay — senão integrity 0 / burning velhos derrubam a parede nova
        // no próximo commit (ex.: molhar).
        //
        // No meio do tick, extinguish muta o mesmo array in-place (splice);
        // refs continuam iguais e este ramo não corre — a água continua a apagar.
        if (!overlay.states) overlay.states = [];
        t.states = overlay.states;
        t.integrity = overlay.integrity ?? 100;
        if (overlay.temperature !== undefined) t.temperature = overlay.temperature;
        else delete t.temperature;
      } else if (t.integrity !== undefined) {
        // Mesmo array: proxy é a fonte da verdade até commit.
        overlay.integrity = t.integrity;
      }
    }
    return t;
  }

  /** Proxy reativo de um WorldObject — material vem do ObjectDef. */
  objectTarget(obj: WorldObject): ReactiveTarget {
    const id = objectTargetId(obj.id);
    let t = this.#targets.get(id);
    if (!obj.states) obj.states = [];
    // R-027: integridade 0–100. Spawn legado com `1` e sem histórico = cheio.
    if (obj.integrity === undefined) obj.integrity = 100;
    else if (
      obj.integrity === 1 &&
      (obj.states?.length ?? 0) === 0 &&
      obj.temperature === undefined
    ) {
      obj.integrity = 100;
    }

    const def = this.#objects?.get(obj.defId);
    const materialId = def?.materialId ?? 'pinho';
    const gridId = obj.gridId ?? this.#world.mainGridId;
    const x = Math.floor(obj.pos.x);
    const y = Math.floor(obj.pos.y);

    if (!t) {
      t = {
        id,
        kind: 'object',
        gridId,
        x,
        y,
        materialId,
        states: obj.states,
        integrity: obj.integrity,
        ...(obj.temperature !== undefined ? { temperature: obj.temperature } : {}),
      };
      this.#targets.set(id, t);
    } else {
      t.materialId = materialId;
      t.x = x;
      t.y = y;
      if (t.states !== obj.states) {
        t.states = obj.states;
        t.integrity = obj.integrity;
        if (obj.temperature !== undefined) t.temperature = obj.temperature;
        else delete t.temperature;
      }
    }
    return t;
  }

  /** Descarta proxy após edição densa (paint/remove) — próximo targetAt lê o overlay. */
  invalidateAt(gridId: string, x: number, y: number): void {
    this.#targets.delete(tileTargetId(gridId, x, y));
  }

  neighborsOf(target: ReactiveTarget): ReactiveTarget[] {
    if (target.gridId === undefined || target.x === undefined || target.y === undefined) return [];
    return this.#world
      .neighbors4(target.gridId, target.x, target.y)
      .map((p) => this.targetAt(target.gridId!, p.x, p.y));
  }

  /**
   * Quem divide a célula com o alvo. R-017 (cascata de contato) e fogo em móveis.
   * Devolve o tile da célula e os outros objetos nela — nunca o próprio alvo.
   */
  occupantsOf(target: ReactiveTarget): ReactiveTarget[] {
    const cell = this.#cellOf(target);
    if (!cell) return [];
    const out: ReactiveTarget[] = [];
    const tile = this.targetAt(cell.gridId, cell.x, cell.y);
    if (tile.id !== target.id) out.push(tile);
    for (const obj of Object.values(this.#sim.state.objects)) {
      const g = obj.gridId ?? this.#world.mainGridId;
      if (g !== cell.gridId) continue;
      if (Math.floor(obj.pos.x) !== cell.x || Math.floor(obj.pos.y) !== cell.y) continue;
      const ot = this.objectTarget(obj);
      if (ot.id !== target.id) out.push(ot);
    }
    return out;
  }

  ambientTemperature(_target: ReactiveTarget): number {
    return this.ambientDefault;
  }

  /**
   * Espelha mutações do substrato de volta às camadas densas / overlay / objetos.
   *
   * R-027 / aceite V1: integridade 0 em tile que bloqueava movimento vira chão
   * de resíduo — o A* volta a passar pelo buraco. Objeto a 0 some do mundo.
   */
  commit(): BridgeCommitResult {
    const dirty: { x: number; y: number; gridId: string }[] = [];
    const objectsUpsert: BridgeCommitResult['objectsUpsert'] = [];
    const objectsRemove: string[] = [];

    for (const t of this.#targets.values()) {
      if (t.kind === 'object') {
        const objectId = t.id.startsWith('object:') ? t.id.slice('object:'.length) : t.id;
        const obj = this.#sim.state.objects[objectId];
        if (!obj) {
          this.#targets.delete(t.id);
          continue;
        }
        const before = objectFingerprint(obj);
        obj.states = t.states;
        if (t.integrity !== undefined) obj.integrity = t.integrity;
        if (t.temperature !== undefined) obj.temperature = t.temperature;
        else delete obj.temperature;

        if ((t.integrity ?? obj.integrity ?? 100) <= 0) {
          const gridId = obj.gridId ?? this.#world.mainGridId;
          const x = Math.floor(obj.pos.x);
          const y = Math.floor(obj.pos.y);
          // Cinzas do móvel no chão — aceite V1 “consome e deixa escombro”
          // também para objetos (não só paredes→chão).
          const ash = depositObjectAsh(this.#world, this.#sim, gridId, x, y, t);
          // Proxy do tile tem de seguir o material — senão o próximo commit
          // reescreve pinho por cima das cinzas.
          if (ash) {
            const tileProxy = this.#targets.get(tileTargetId(gridId, x, y));
            if (tileProxy) {
              tileProxy.materialId = ash.materialId;
              if (tileProxy.integrity === undefined || tileProxy.integrity > ash.integrity) {
                tileProxy.integrity = ash.integrity;
              }
            }
          }
          delete this.#sim.state.objects[objectId];
          this.#targets.delete(t.id);
          objectsRemove.push(objectId);
          dirty.push({ gridId, x, y });
          continue;
        }

        if (before !== objectFingerprint(obj)) {
          objectsUpsert.push(objectVisible(obj));
          dirty.push({
            gridId: obj.gridId ?? this.#world.mainGridId,
            x: Math.floor(obj.pos.x),
            y: Math.floor(obj.pos.y),
          });
        }
        continue;
      }

      if (t.gridId === undefined || t.x === undefined || t.y === undefined) continue;
      const overlay = this.#sim.overlayAt(t.gridId, t.x, t.y, true);
      const tileBefore = this.#world.tileAt(t.gridId, t.x, t.y);
      const before = fingerprint(
        overlay.states,
        overlay.integrity,
        overlay.temperature,
        tileBefore.materialId,
        tileBefore.type,
      );

      overlay.states = t.states;
      if (t.integrity !== undefined) overlay.integrity = t.integrity;
      if (t.temperature !== undefined) overlay.temperature = t.temperature;
      else delete overlay.temperature;

      if (tileBefore.materialId !== t.materialId) {
        this.#world.setMaterial(t.gridId, t.x, t.y, t.materialId);
      }

      // Estrutura consumida pelo fogo vira escombro atravessável.
      const integrity = t.integrity ?? overlay.integrity ?? 100;
      if (
        integrity <= 0 &&
        blocksMovement(tileBefore.type, tileBefore.state) &&
        tileBefore.type !== 'floor'
      ) {
        this.#world.setType(t.gridId, t.x, t.y, 'floor');
        if (overlay.state) {
          const { isOpen: _o, isLocked: _l, ...rest } = overlay.state;
          overlay.state = Object.keys(rest).length > 0 ? rest : undefined;
          if (overlay.state === undefined) delete overlay.state;
        }
      }

      const tileAfter = this.#world.tileAt(t.gridId, t.x, t.y);
      const after = fingerprint(
        overlay.states,
        overlay.integrity,
        overlay.temperature,
        tileAfter.materialId,
        tileAfter.type,
      );
      if (before !== after) dirty.push({ gridId: t.gridId, x: t.x, y: t.y });
    }
    return { tiles: dirty, objectsUpsert, objectsRemove };
  }

  burningCount(): number {
    let n = 0;
    for (const t of this.#targets.values()) {
      if (t.states.some((s) => s.type === 'burning' && s.intensity > 0)) n += 1;
    }
    return n;
  }

  #cellOf(target: ReactiveTarget): { gridId: string; x: number; y: number } | undefined {
    if (target.gridId !== undefined && target.x !== undefined && target.y !== undefined) {
      return { gridId: target.gridId, x: target.x, y: target.y };
    }
    return undefined;
  }
}

function fingerprint(
  states: TransientState[] | undefined,
  integrity: number | undefined,
  temperature: number | undefined,
  materialId: string,
  tileType: string,
): string {
  return JSON.stringify({ states: states ?? [], integrity, temperature, materialId, tileType });
}

function objectFingerprint(obj: WorldObject): string {
  return JSON.stringify({
    states: obj.states ?? [],
    integrity: obj.integrity,
    temperature: obj.temperature,
    materialId: obj.defId,
  });
}

function objectVisible(o: WorldObject): BridgeCommitResult['objectsUpsert'][number] {
  const states =
    o.states && o.states.length > 0
      ? o.states.map((s) => ({ type: s.type, intensity: s.intensity }))
      : undefined;
  return {
    id: o.id,
    defId: o.defId,
    pos: { x: o.pos.x, y: o.pos.y },
    ...(o.rotation !== undefined ? { rotation: o.rotation } : {}),
    ...(states ? { states } : {}),
    ...(o.integrity !== undefined ? { integrity: o.integrity } : {}),
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
  };
}

const ASH_MATERIALS = new Set(['cinza', 'carvao', 'lascas', 'entulho', 'sucata', 'cacos']);

/** Deixa resíduo do móvel consumido no tile (chão) + fumaça breve. */
function depositObjectAsh(
  world: World,
  sim: Simulation,
  gridId: string,
  x: number,
  y: number,
  target: ReactiveTarget,
): { materialId: string; integrity: number } | undefined {
  const tile = world.tileAt(gridId, x, y);
  if (tile.type !== 'floor' && tile.type !== 'road') return undefined;

  const residue = ASH_MATERIALS.has(target.materialId) ? target.materialId : 'cinza';
  if (tile.materialId !== residue) {
    world.setMaterial(gridId, x, y, residue);
  }

  const overlay = sim.overlayAt(gridId, x, y, true);
  if (!overlay.states) overlay.states = [];
  const smoky = overlay.states.find((s) => s.type === 'smoky');
  if (smoky) {
    smoky.intensity = Math.max(smoky.intensity, 45);
  } else {
    overlay.states.push({ type: 'smoky', intensity: 45 });
  }
  // Integridade do chão marca o “buraco” de combustível — escurece no cliente.
  const integrity = 35;
  if (overlay.integrity === undefined || overlay.integrity > integrity) {
    overlay.integrity = integrity;
  }
  return { materialId: residue, integrity: overlay.integrity ?? integrity };
}
