/**
 * Mundo geográfico: grids, células e visão montada do tile. W-001, W-058–W-061.
 *
 * Camadas densas + overlay esparso. Célula ausente no overlay é célula intacta.
 * Grid é unidade de escopo: pathfinding e substrato ficam dentro de um grid e
 * só cruzam por caminhos declarados.
 */

import type { Simulation } from '../state/index.js';
import type { Grid, Tile, TileOverlay, TileType } from '../types/domain.js';
import { cellOf, DEFAULT_METERS_PER_TILE, type WorldScale } from './scale.js';
import { TileLayers } from './tile-layers.js';
import { blocksMovement, blocksVision, type StructuralState } from './tiles.js';

export interface WorldOptions {
  readonly sim: Simulation;
  readonly scale?: WorldScale;
}

export class World {
  readonly sim: Simulation;
  readonly scale: WorldScale;

  constructor(opts: WorldOptions) {
    this.sim = opts.sim;
    this.scale = opts.scale ?? { metersPerTile: DEFAULT_METERS_PER_TILE };
  }

  get mainGridId(): string {
    return this.sim.mainGridId;
  }

  grids(): readonly Grid[] {
    return this.sim.state.grids;
  }

  grid(id: string): Grid {
    const g = this.sim.state.grids.find((x) => x.id === id);
    if (!g) throw new Error(`grid desconhecido: "${id}"`);
    return g;
  }

  layers(gridId = this.mainGridId): TileLayers {
    return this.sim.layersOf(gridId);
  }

  inBounds(gridId: string, x: number, y: number): boolean {
    const g = this.grid(gridId);
    return x >= 0 && y >= 0 && x < g.width && y < g.height;
  }

  /**
   * Visão montada da célula. W-058.
   *
   * `Tile` não é a forma guardada — é o que se monta a partir das camadas densas
   * e do overlay esparso. Quem consulta o mundo recebe isto; quem muta escreve
   * nas camadas ou no overlay.
   */
  tileAt(gridId: string, x: number, y: number): Tile {
    if (!this.inBounds(gridId, x, y)) {
      throw new RangeError(`célula (${x}, ${y}) fora do grid "${gridId}"`);
    }
    const layers = this.layers(gridId);
    const overlay = this.sim.overlayAt(gridId, x, y);
    const tile: Tile = {
      type: layers.typeAt(x, y),
      materialId: layers.materialAt(x, y),
      pos: { x, y },
      gridId,
      baseHeight: layers.baseHeightAt(x, y),
    };
    if (!overlay) return tile;
    return mergeOverlay(tile, overlay);
  }

  /** Célula sob uma posição contínua. W-002. */
  tileAtWorld(gridId: string, wx: number, wy: number): Tile {
    const c = cellOf(wx, wy);
    return this.tileAt(gridId, c.x, c.y);
  }

  setType(gridId: string, x: number, y: number, type: TileType): void {
    this.layers(gridId).setTypeAt(x, y, type);
  }

  setMaterial(gridId: string, x: number, y: number, materialId: string): void {
    this.layers(gridId).setMaterialAt(x, y, materialId);
  }

  /** Estado estrutural (porta). W-004. */
  setStructural(gridId: string, x: number, y: number, state: StructuralState): void {
    const o = this.sim.overlayAt(gridId, x, y, true);
    o.state = { ...(o.state ?? {}), ...state };
  }

  openDoor(gridId: string, x: number, y: number): void {
    const t = this.tileAt(gridId, x, y);
    if (t.type !== 'door') throw new Error(`célula (${x}, ${y}) não é porta`);
    if (t.state?.isLocked) throw new Error(`porta (${x}, ${y}) trancada`);
    this.setStructural(gridId, x, y, { isOpen: true });
  }

  closeDoor(gridId: string, x: number, y: number): void {
    const t = this.tileAt(gridId, x, y);
    if (t.type !== 'door') throw new Error(`célula (${x}, ${y}) não é porta`);
    this.setStructural(gridId, x, y, { isOpen: false });
  }

  blocksMovementAt(gridId: string, x: number, y: number): boolean {
    if (!this.inBounds(gridId, x, y)) return true;
    const t = this.tileAt(gridId, x, y);
    return blocksMovement(t.type, t.state);
  }

  blocksVisionAt(gridId: string, x: number, y: number): boolean {
    if (!this.inBounds(gridId, x, y)) return true;
    const t = this.tileAt(gridId, x, y);
    return blocksVision(t.type, t.state);
  }

  /**
   * Vizinhos ortogonais dentro do grid. Pathfinding e substrato usam isto.
   * Ordem fixa N, E, S, W — determinismo (X-004).
   */
  neighbors4(gridId: string, x: number, y: number): { x: number; y: number }[] {
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    return deltas
      .map((d) => ({ x: x + d.x, y: y + d.y }))
      .filter((p) => this.inBounds(gridId, p.x, p.y));
  }

  /**
   * Acrescenta um grid alinhado (andar / porão). W-059, W-060.
   *
   * `originOffset` permite um sótão menor que a planta baixa — memória, não
   * estética: um grid 20×14 com deslocamento em vez de um mapa inteiro vazio.
   */
  addAlignedGrid(opts: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly zLevel: number;
    readonly name?: string;
    readonly originOffset?: { x: number; y: number };
    readonly defaultType?: TileType;
    readonly defaultMaterialId?: string;
  }): Grid {
    if (this.sim.state.grids.some((g) => g.id === opts.id)) {
      throw new Error(`grid já existe: "${opts.id}"`);
    }
    if (opts.width < 1 || opts.height < 1 || opts.width > 512 || opts.height > 512) {
      throw new RangeError(`dimensões de grid fora de 1..512: ${opts.width}×${opts.height}`);
    }
    const main = this.layers(this.mainGridId);
    const grid: Grid = {
      id: opts.id,
      width: opts.width,
      height: opts.height,
      alignment: 'aligned',
      zLevel: opts.zLevel,
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.originOffset ? { originOffset: opts.originOffset } : {}),
    };
    const layers = TileLayers.create(opts.id, opts.width, opts.height, {
      type: opts.defaultType ?? 'floor',
      materialId: opts.defaultMaterialId ?? main.materialAt(0, 0),
    });
    this.sim.state.grids.push(grid);
    this.sim.layers.set(opts.id, layers);
    this.sim.state.tileOverlays[opts.id] = {};
    // tileLayers no estado é sincronizado em commit(); aqui mantemos o vivo.
    return grid;
  }

  /**
   * Coordenada no grid alinhado correspondente a uma célula do principal.
   * Devolve undefined se cai fora do deslocamento / tamanho. W-060.
   */
  toAligned(gridId: string, mainX: number, mainY: number): { x: number; y: number } | undefined {
    const g = this.grid(gridId);
    if (g.alignment !== 'aligned') return undefined;
    const ox = g.originOffset?.x ?? 0;
    const oy = g.originOffset?.y ?? 0;
    const x = mainX - ox;
    const y = mainY - oy;
    if (!this.inBounds(gridId, x, y)) return undefined;
    return { x, y };
  }

  /** Inverso de `toAligned`. */
  toMain(gridId: string, localX: number, localY: number): { x: number; y: number } {
    const g = this.grid(gridId);
    const ox = g.originOffset?.x ?? 0;
    const oy = g.originOffset?.y ?? 0;
    return { x: localX + ox, y: localY + oy };
  }

  /**
   * Grids alinhados sob a célula do principal, do mais alto ao mais baixo.
   * Queda (W-062) percorre esta lista.
   */
  alignedStackAt(mainX: number, mainY: number): Grid[] {
    return this.sim.state.grids
      .filter((g) => g.alignment === 'aligned' && this.toAligned(g.id, mainX, mainY))
      .sort((a, b) => (b.zLevel ?? 0) - (a.zLevel ?? 0));
  }
}

function mergeOverlay(tile: Tile, o: TileOverlay): Tile {
  const out: Tile = { ...tile };
  if (o.tileHeight !== undefined) out.tileHeight = o.tileHeight;
  if (o.pressure !== undefined) out.pressure = o.pressure;
  if (o.gravityMultiplier !== undefined) out.gravityMultiplier = o.gravityMultiplier;
  if (o.temperature !== undefined) out.temperature = o.temperature;
  if (o.integrity !== undefined) out.integrity = o.integrity;
  if (o.rotation !== undefined) out.rotation = o.rotation;
  if (o.state !== undefined) out.state = o.state as NonNullable<Tile['state']>;
  if (o.states !== undefined) out.states = o.states;
  if (o.coverings !== undefined) out.coverings = o.coverings;
  if (o.liquid !== undefined) out.liquid = o.liquid as NonNullable<Tile['liquid']>;
  if (o.gas !== undefined) out.gas = o.gas;
  if (o.occupancy !== undefined) out.occupancy = o.occupancy;
  if (o.storedObjectIds !== undefined) out.storedObjectIds = o.storedObjectIds;
  if (o.sectorId !== undefined) out.sectorId = o.sectorId;
  if (o.locationLabel !== undefined) out.locationLabel = o.locationLabel;
  return out;
}

