/**
 * Carga do portador e penalidade de movimento. O-013, O-014, O-015.
 *
 * A carga **não** escreve em `capacities.moving` — aquele valor é derivado de
 * partes e condições. Peso entra no cálculo de velocidade ao lado da
 * mobilidade, nunca dentro dela (V-013, O-015).
 */

import type { ObjectDef } from '../types/domain.js';
import { DEFAULT_OBJECTS_TUNING, type ObjectsTuning, type StoredItem } from './volume.js';

/** Peso de um item, incluindo conteúdo e pilha. O-013. */
export function itemWeight(item: StoredItem): number {
  const count = item.count ?? 1;
  let w = item.def.weight * count;
  if (item.contents) w += item.contents.reduce((t, c) => t + itemWeight(c), 0);
  return w;
}

/** Soma pura do inventário. Recomputada por invalidação, nunca por tick. O-013. */
export function totalCarryWeight(items: readonly StoredItem[]): number {
  return items.reduce((t, i) => t + itemWeight(i), 0);
}

/**
 * Capacidade em kg. O-014.
 *
 * Base de tuning × média de moving e manipulation — um braço quebrado reduz
 * o que a pessoa consegue levar sem regra ligando braço a mochila.
 */
export function carryCapacityKg(
  moving: number,
  manipulation: number,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  const fator = (clamp01(moving) + clamp01(manipulation)) / 2;
  return tuning.baseCarryKg * Math.max(0.05, fator);
}

export interface CarryCheck {
  readonly weight: number;
  readonly capacity: number;
  readonly fraction: number;
  readonly canTakeMore: boolean;
  readonly reason?: string;
}

export function checkCarry(
  items: readonly StoredItem[],
  moving: number,
  manipulation: number,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): CarryCheck {
  const weight = totalCarryWeight(items);
  const capacity = carryCapacityKg(moving, manipulation, tuning);
  const fraction = capacity > 0 ? weight / capacity : Infinity;
  if (fraction > 1) {
    return {
      weight,
      capacity,
      fraction,
      canTakeMore: false,
      reason: 'o peso puxa demais — não dá para levar mais',
    };
  }
  return { weight, capacity, fraction, canTakeMore: true };
}

/**
 * Fator de velocidade por carga, em [piso, 1]. O-015.
 *
 * Abaixo do limiar não há penalidade (uma faca no cinto não atrasa). Acima,
 * cai linearmente até o piso — sobrecarga é lentidão, não paralisia.
 */
export function speedFactorFromLoad(
  weight: number,
  capacity: number,
  tuning: ObjectsTuning = DEFAULT_OBJECTS_TUNING,
): number {
  if (capacity <= 0) return tuning.minSpeedFactorByLoad;
  const fraction = weight / capacity;
  if (fraction <= tuning.loadPenaltyThreshold) return 1;
  if (fraction >= 1) return tuning.minSpeedFactorByLoad;
  const t =
    (fraction - tuning.loadPenaltyThreshold) / (1 - tuning.loadPenaltyThreshold);
  return 1 - t * (1 - tuning.minSpeedFactorByLoad);
}

/** Lista plana de ObjectDef a partir do inventário — útil em testes. */
export function defsOnly(defs: readonly ObjectDef[]): StoredItem[] {
  return defs.map((def) => ({ def }));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
