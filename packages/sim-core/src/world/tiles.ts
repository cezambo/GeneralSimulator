/**
 * Regras mecânicas por tipo de tile. W-003, W-004, W-006.
 *
 * O tipo declara o padrão; o material não. Abrir e fechar é de porta e
 * janela, independente de ser madeira ou ferro. Estado estrutural (`isOpen`,
 * `isLocked`) vive no overlay, distinto dos estados transientes do substrato.
 */

import type { TileType } from '../types/domain.js';

export const TILE_TYPES: readonly TileType[] = [
  'floor',
  'wall',
  'door',
  'window',
  'roof',
  'water',
  'road',
];

export interface TileBlocking {
  /** Bloqueia movimento quando fechado / por padrão. */
  readonly blocksMovement: boolean;
  /** Bloqueia linha de visão quando fechado / por padrão. */
  readonly blocksVision: boolean;
  /** Pode alternar aberto/fechado (porta, janela). */
  readonly canOpen: boolean;
}

/**
 * Padrões de bloqueio por tipo. W-003.
 *
 * Parede bloqueia movimento e visão; janela só movimento; chão não bloqueia
 * nada. Porta/janela fechada bloqueiam movimento; abertas, nenhum. Visão:
 * janela nunca oclui; porta fechada oclui.
 */
export const TILE_BLOCKING: Readonly<Record<TileType, TileBlocking>> = {
  floor: { blocksMovement: false, blocksVision: false, canOpen: false },
  road: { blocksMovement: false, blocksVision: false, canOpen: false },
  water: { blocksMovement: false, blocksVision: false, canOpen: false },
  roof: { blocksMovement: false, blocksVision: false, canOpen: false },
  wall: { blocksMovement: true, blocksVision: true, canOpen: false },
  window: { blocksMovement: true, blocksVision: false, canOpen: true },
  door: { blocksMovement: true, blocksVision: true, canOpen: true },
};

export interface StructuralState {
  readonly isOpen?: boolean;
  readonly isLocked?: boolean;
}

/** Movimento efetivo, respeitando porta/janela aberta. W-003, W-004. */
export function blocksMovement(type: TileType, structural?: StructuralState): boolean {
  const base = TILE_BLOCKING[type];
  if (base.canOpen && structural?.isOpen === true) return false;
  return base.blocksMovement;
}

/** Visão efetiva. Janela nunca oclui; porta aberta também não. W-003, W-008. */
export function blocksVision(type: TileType, structural?: StructuralState): boolean {
  const base = TILE_BLOCKING[type];
  if (base.canOpen && structural?.isOpen === true) return false;
  return base.blocksVision;
}

/**
 * Porta/janela fechada isolam a aresta de vizinhança do substrato (fogo, calor,
 * cadeia elétrica…). Abertas não. Parede não usa isto — o material decide se
 * inflama; o tipo só governa abertura.
 *
 * Sem cláusula na SPEC-R: alinhado a DF e a W-004 (fechado = barreira).
 */
export function blocksNeighborhood(type: TileType, structural?: StructuralState): boolean {
  const base = TILE_BLOCKING[type];
  if (!base.canOpen) return false;
  return structural?.isOpen !== true;
}
