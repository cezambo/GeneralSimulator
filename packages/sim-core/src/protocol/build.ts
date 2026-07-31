/**
 * Operações de construção no núcleo. 05-PROTOCOLO §5.3.
 * Histórico undo/redo vive aqui — não no cliente.
 */

import type { Simulation } from '../state/index.js';
import type { ObjectDef, TileType, WorldObject } from '../types/domain.js';
import type { World } from '../world/grid.js';
import { TILE_TYPES } from '../world/tiles.js';
import { tileCellSnapshot } from './snapshot.js';
import type { WorldDeltaPayload } from './types.js';
import { ProtocolError } from './envelope.js';

export interface TileCellEdit {
  x: number;
  y: number;
  type: TileType;
  materialId: string;
}

export type BuildEdit =
  | { kind: 'tiles'; before: TileCellEdit[]; after: TileCellEdit[] }
  | { kind: 'placeObject'; object: WorldObject }
  | { kind: 'removeObject'; object: WorldObject }
  | { kind: 'transformObject'; before: WorldObject; after: WorldObject };

const DEFAULT_FLOOR: Pick<TileCellEdit, 'type' | 'materialId'> = {
  type: 'floor',
  materialId: 'pinho',
};

export class BuildHistory {
  readonly #undo: BuildEdit[] = [];
  readonly #redo: BuildEdit[] = [];
  readonly #sim: Simulation;
  readonly #world: World;
  readonly #objects: ReadonlyMap<string, ObjectDef> | undefined;

  constructor(
    sim: Simulation,
    world: World,
    objects?: ReadonlyMap<string, ObjectDef>,
  ) {
    this.#sim = sim;
    this.#world = world;
    this.#objects = objects;
  }

  get undoDepth(): number {
    return this.#undo.length;
  }

  get redoDepth(): number {
    return this.#redo.length;
  }

  paintTiles(
    tileType: string,
    materialId: string,
    cellsRaw: unknown,
  ): WorldDeltaPayload {
    if (!TILE_TYPES.includes(tileType as TileType)) {
      throw new ProtocolError('BAD_TILE', `tipo de tile inválido: ${tileType}`);
    }
    if (!materialId) {
      throw new ProtocolError('BAD_MATERIAL', 'materialId obrigatório');
    }
    const cells = parseCells(cellsRaw);
    if (cells.length === 0) {
      throw new ProtocolError('BAD_CELLS', 'cells precisa de ao menos uma célula');
    }
    const gridId = this.#world.mainGridId;
    const before: TileCellEdit[] = [];
    const after: TileCellEdit[] = [];
    for (const { x, y } of cells) {
      if (!this.#world.inBounds(gridId, x, y)) {
        throw new ProtocolError('OUT_OF_BOUNDS', `célula (${x},${y}) fora do mapa`);
      }
      const cur = this.#world.tileAt(gridId, x, y);
      before.push({ x, y, type: cur.type, materialId: cur.materialId });
      this.#applyTile(gridId, x, y, tileType as TileType, materialId);
      after.push({ x, y, type: tileType as TileType, materialId });
    }
    this.#push({ kind: 'tiles', before, after });
    return { tiles: after.map((c) => tileCellSnapshot(this.#sim, this.#world, gridId, c.x, c.y)) };
  }

  /** Apaga tile → chão de pinho (vazio estrutural da sala). */
  removeTiles(cellsRaw: unknown): WorldDeltaPayload {
    return this.paintTiles(DEFAULT_FLOOR.type, DEFAULT_FLOOR.materialId, cellsRaw);
  }

  placeObject(
    objectDefId: string,
    pos: { x: number; y: number },
    rotation = 0,
  ): WorldDeltaPayload {
    if (!this.#objects) {
      throw new ProtocolError('UNSUPPORTED', 'catálogo de objetos não carregado');
    }
    const def = this.#objects.get(objectDefId);
    if (!def) {
      throw new ProtocolError('NOT_FOUND', `ObjectDef "${objectDefId}" ausente`);
    }
    const gridId = this.#world.mainGridId;
    const gx = Math.floor(pos.x);
    const gy = Math.floor(pos.y);
    if (!this.#world.inBounds(gridId, gx, gy)) {
      throw new ProtocolError('OUT_OF_BOUNDS', `posição (${gx},${gy}) fora do mapa`);
    }
    if (this.#world.blocksMovementAt(gridId, gx, gy)) {
      throw new ProtocolError('BLOCKED', 'não dá para colocar móvel em célula bloqueada');
    }
    const obj: WorldObject = {
      id: this.#sim.nextId('obj'),
      defId: def.id,
      pos: { x: gx + 0.5, y: gy + 0.5 },
      gridId,
      rotation,
      integrity: 1,
    };
    this.#sim.state.objects[obj.id] = obj;
    this.#push({ kind: 'placeObject', object: cloneObj(obj) });
    return {
      objectsUpsert: [
        {
          id: obj.id,
          defId: obj.defId,
          pos: { x: obj.pos.x, y: obj.pos.y },
          ...(obj.rotation !== undefined ? { rotation: obj.rotation } : {}),
        },
      ],
    };
  }

  removeObject(opts: { objectId?: string; cell?: { x: number; y: number } }): WorldDeltaPayload {
    const obj = this.#resolveObject(opts);
    const copy = cloneObj(obj);
    delete this.#sim.state.objects[obj.id];
    this.#push({ kind: 'removeObject', object: copy });
    return { objectsRemove: [copy.id] };
  }

  /** Move móvel para outra célula (undo = volta à posição anterior). */
  moveObject(
    opts: { objectId?: string; cell?: { x: number; y: number } },
    to: { x: number; y: number },
  ): WorldDeltaPayload {
    const obj = this.#resolveObject(opts);
    const gridId = this.#world.mainGridId;
    const gx = Math.floor(to.x);
    const gy = Math.floor(to.y);
    if (!this.#world.inBounds(gridId, gx, gy)) {
      throw new ProtocolError('OUT_OF_BOUNDS', `destino (${gx},${gy}) fora do mapa`);
    }
    if (this.#world.blocksMovementAt(gridId, gx, gy)) {
      throw new ProtocolError('BLOCKED', 'destino bloqueado');
    }
    const occupant = findObjectAt(this.#sim, gridId, gx, gy);
    if (occupant && occupant.id !== obj.id) {
      throw new ProtocolError('OCCUPIED', 'já há um móvel no destino');
    }
    const before = cloneObj(obj);
    obj.pos = { x: gx + 0.5, y: gy + 0.5 };
    const after = cloneObj(obj);
    this.#push({ kind: 'transformObject', before, after });
    return { objectsUpsert: [objectVisible(after)] };
  }

  /** Rotaciona móvel (graus absolutos ou delta se `delta` for true). */
  rotateObject(
    opts: { objectId?: string; cell?: { x: number; y: number } },
    degrees: number,
    delta = false,
  ): WorldDeltaPayload {
    const obj = this.#resolveObject(opts);
    const before = cloneObj(obj);
    const base = obj.rotation ?? 0;
    const next = delta ? base + degrees : degrees;
    obj.rotation = ((next % 360) + 360) % 360;
    const after = cloneObj(obj);
    this.#push({ kind: 'transformObject', before, after });
    return { objectsUpsert: [objectVisible(after)] };
  }

  undo(): WorldDeltaPayload {
    const entry = this.#undo.pop();
    if (!entry) {
      throw new ProtocolError('NOTHING_TO_UNDO', 'histórico de construção vazio');
    }
    const delta = this.#applyInverse(entry);
    this.#redo.push(entry);
    return delta;
  }

  redo(): WorldDeltaPayload {
    const entry = this.#redo.pop();
    if (!entry) {
      throw new ProtocolError('NOTHING_TO_REDO', 'nada para refazer');
    }
    const delta = this.#applyForward(entry);
    this.#undo.push(entry);
    return delta;
  }

  #push(entry: BuildEdit): void {
    this.#undo.push(entry);
    if (this.#undo.length > 64) this.#undo.shift();
    this.#redo.length = 0;
  }

  #applyTile(gridId: string, x: number, y: number, type: TileType, materialId: string): void {
    this.#world.setType(gridId, x, y, type);
    this.#world.setMaterial(gridId, x, y, materialId);
    const overlay = this.#sim.overlayAt(gridId, x, y, true);
    if (type === 'door') {
      try {
        this.#world.openDoor(gridId, x, y);
      } catch {
        // porta trancada / já aberta — paint ainda vale.
      }
    } else if (overlay.state) {
      // Parede/chão não carregam isOpen de porta antiga.
      delete overlay.state;
    }
  }

  #resolveObject(opts: { objectId?: string; cell?: { x: number; y: number } }): WorldObject {
    const obj = opts.objectId
      ? this.#sim.state.objects[opts.objectId]
      : opts.cell
        ? findObjectAt(this.#sim, this.#world.mainGridId, opts.cell.x, opts.cell.y)
        : undefined;
    if (!obj) {
      throw new ProtocolError('NOT_FOUND', 'objeto não encontrado');
    }
    return obj;
  }

  #applyForward(entry: BuildEdit): WorldDeltaPayload {
    const gridId = this.#world.mainGridId;
    if (entry.kind === 'tiles') {
      for (const c of entry.after) {
        this.#applyTile(gridId, c.x, c.y, c.type, c.materialId);
      }
      return {
        tiles: entry.after.map((c) => tileCellSnapshot(this.#sim, this.#world, gridId, c.x, c.y)),
      };
    }
    if (entry.kind === 'placeObject') {
      this.#sim.state.objects[entry.object.id] = cloneObj(entry.object);
      return { objectsUpsert: [objectVisible(entry.object)] };
    }
    if (entry.kind === 'transformObject') {
      this.#sim.state.objects[entry.after.id] = cloneObj(entry.after);
      return { objectsUpsert: [objectVisible(entry.after)] };
    }
    delete this.#sim.state.objects[entry.object.id];
    return { objectsRemove: [entry.object.id] };
  }

  #applyInverse(entry: BuildEdit): WorldDeltaPayload {
    const gridId = this.#world.mainGridId;
    if (entry.kind === 'tiles') {
      for (const c of entry.before) {
        this.#applyTile(gridId, c.x, c.y, c.type, c.materialId);
      }
      return {
        tiles: entry.before.map((c) => tileCellSnapshot(this.#sim, this.#world, gridId, c.x, c.y)),
      };
    }
    if (entry.kind === 'placeObject') {
      delete this.#sim.state.objects[entry.object.id];
      return { objectsRemove: [entry.object.id] };
    }
    if (entry.kind === 'transformObject') {
      this.#sim.state.objects[entry.before.id] = cloneObj(entry.before);
      return { objectsUpsert: [objectVisible(entry.before)] };
    }
    this.#sim.state.objects[entry.object.id] = cloneObj(entry.object);
    return { objectsUpsert: [objectVisible(entry.object)] };
  }
}

function parseCells(cellsRaw: unknown): { x: number; y: number }[] {
  if (!Array.isArray(cellsRaw)) return [];
  const out: { x: number; y: number }[] = [];
  for (const c of cellsRaw) {
    if (!c || typeof c !== 'object') continue;
    const x = Math.floor(Number((c as { x?: unknown }).x));
    const y = Math.floor(Number((c as { y?: unknown }).y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }
  return out;
}

function findObjectAt(
  sim: Simulation,
  gridId: string,
  x: number,
  y: number,
): WorldObject | undefined {
  for (const o of Object.values(sim.state.objects)) {
    if ((o.gridId ?? gridId) !== gridId) continue;
    if (Math.floor(o.pos.x) === x && Math.floor(o.pos.y) === y) return o;
  }
  return undefined;
}

function cloneObj(o: WorldObject): WorldObject {
  return structuredClone(o);
}

function objectVisible(o: WorldObject): {
  id: string;
  defId: string;
  pos: { x: number; y: number };
  rotation?: number;
} {
  return {
    id: o.id,
    defId: o.defId,
    pos: { x: o.pos.x, y: o.pos.y },
    ...(o.rotation !== undefined ? { rotation: o.rotation } : {}),
  };
}
