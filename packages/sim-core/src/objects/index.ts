/**
 * Objetos: volume, carga e Funcionamento. SPEC-O (núcleo P0).
 */

export {
  DEFAULT_OBJECTS_TUNING,
  canFit,
  contentsVolume,
  effectiveVolume,
  occupiedVolume,
  packingWhenStored,
  stackEffectiveVolume,
  type FitResult,
  type ObjectsTuning,
  type StoredItem,
} from './volume.js';
export {
  carryCapacityKg,
  checkCarry,
  defsOnly,
  itemWeight,
  speedFactorFromLoad,
  totalCarryWeight,
  type CarryCheck,
} from './carry.js';
export {
  resolveFunction,
  type FunctionAttempt,
  type FunctionResult,
} from './functioning.js';
