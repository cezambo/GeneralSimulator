/**
 * Volume efetivo e empacotamento. O-001, O-002, O-003, O-007.
 *
 * Contagem de itens não é unidade de capacidade em lugar nenhum: o que limita
 * é o volume efetivo somado. O PEM mede o vão que a forma impõe; o peso nunca
 * é afetado por ele.
 */

import type { ObjectDef } from '../types/domain.js';

export interface ObjectsTuning {
  readonly fittedPem: number;
  readonly stackPemFactor: number;
  readonly baseCarryKg: number;
  readonly loadPenaltyThreshold: number;
  readonly minSpeedFactorByLoad: number;
}

export const DEFAULT_OBJECTS_TUNING: ObjectsTuning = {
  fittedPem: 1.0,
  stackPemFactor: 0.6,
  baseCarryKg: 35,
  loadPenaltyThreshold: 0.5,
  minSpeedFactorByLoad: 0.25,
};

/** Volume efetivo de um exemplar solto: volume × PEM. O-002. */
export function effectiveVolume(def: ObjectDef, pem = def.packingEfficiency): number {
  return def.volume * pem;
}

/**
 * PEM ao guardar `item` dentro de `container`. O-002.
 *
 * Se o recipiente declara `fittedFor` contendo o tipo, o PEM cai ao piso de
 * tuning — aljava vs saco, sem sistema de aljava.
 */
export function packingWhenStored(
  item: ObjectDef,
  container: ObjectDef,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  if (container.fittedFor?.includes(item.id)) return tuning.fittedPem;
  return item.packingEfficiency;
}

/** Volume efetivo de uma pilha. O-007. Empilhar atenua o PEM, nunca aumenta. */
export function stackEffectiveVolume(
  def: ObjectDef,
  count: number,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  const pem = def.packingEfficiency * Math.min(1, tuning.stackPemFactor);
  return def.volume * count * pem;
}

export interface StoredItem {
  readonly def: ObjectDef;
  /** Quantidade na pilha; 1 se não empilha. */
  readonly count?: number;
  /** Conteúdo aninhado, se este item também é recipiente. */
  readonly contents?: readonly StoredItem[];
}

/**
 * Quanto um item ocupa **neste** recipiente. O-003.
 *
 * Recipiente dentro de recipiente conta pelo **maior** entre o próprio volume
 * efetivo e a soma do que carrega — aninhar nunca cria espaço.
 */
export function occupiedVolume(
  item: StoredItem,
  container: ObjectDef,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  const count = item.count ?? 1;
  const pem = packingWhenStored(item.def, container, tuning);
  const selfVol =
    count > 1 ? item.def.volume * count * pem * Math.min(1, tuning.stackPemFactor) : effectiveVolume(item.def, pem);

  if (!item.contents || item.contents.length === 0) return selfVol;

  const inner = item.contents.reduce((t, c) => t + occupiedVolume(c, item.def, tuning), 0);
  return Math.max(selfVol, inner);
}

export function contentsVolume(
  contents: readonly StoredItem[],
  container: ObjectDef,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  return contents.reduce((t, c) => t + occupiedVolume(c, container, tuning), 0);
}

export interface FitResult {
  readonly ok: boolean;
  readonly used: number;
  readonly capacity: number;
  readonly free: number;
  /** Retorno diegético quando não cabe. V-006. */
  readonly reason?: string;
}

/**
 * Cabe no recipiente? O-003.
 *
 * Sem limite de quantidade: sessenta agulhas cabem, uma bigorna não.
 */
export function canFit(
  container: ObjectDef,
  current: readonly StoredItem[],
  incoming: StoredItem,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): FitResult {
  const capacity = container.containerVolume ?? 0;
  if (!container.isContainer || capacity <= 0) {
    return {
      ok: false,
      used: 0,
      capacity: 0,
      free: 0,
      reason: 'não há onde guardar isso',
    };
  }
  const used = contentsVolume(current, container, tuning);
  const need = occupiedVolume(incoming, container, tuning);
  const free = capacity - used;
  if (need > free + 1e-12) {
    return {
      ok: false,
      used,
      capacity,
      free,
      reason: 'não cabe — o vão que resta é menor que a coisa',
    };
  }
  return { ok: true, used, capacity, free };
}
