/**
 * Escala do tile. W-057, X-008.
 *
 * Toda grandeza espacial nasce em metros e chega a células dividida por esta
 * escala. Nenhuma constante em células vive em código.
 */

export const DEFAULT_METERS_PER_TILE = 0.5;

export interface WorldScale {
  readonly metersPerTile: number;
}

export function metersToTiles(meters: number, scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE }): number {
  return meters / scale.metersPerTile;
}

export function tilesToMeters(tiles: number, scale: WorldScale = { metersPerTile: DEFAULT_METERS_PER_TILE }): number {
  return tiles * scale.metersPerTile;
}

/**
 * Célula discreta que contém uma posição contínua. W-001, W-002.
 *
 * O grid governa tiles e colisão; a entidade para em ponto flutuante. Floor
 * (e não round) é o contrato: a célula `(12, 8)` cobre `[12, 13) × [8, 9)` em
 * coordenadas de tile.
 */
export function cellOf(x: number, y: number): { x: number; y: number } {
  return { x: Math.floor(x), y: Math.floor(y) };
}

/** Chave canônica de overlay. Mesma forma que `Simulation.overlayAt`. */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
