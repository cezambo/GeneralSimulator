import type { ReactiveTarget } from './target.js';
import { stateOf } from './target.js';

/**
 * Atmosfera V1 mínima para fogo. Não é R-023 (difusão de gás = V2).
 *
 * Oxigênio esparso por alvo: ausente = ambiente cheio. Fumaça (`smoky`)
 * correlaciona com O₂ reduzido quando o campo ainda não foi materializado
 * pelo consumo da queima — quarto fechado com fumaça já “começa” pobre.
 */

export interface AtmosphereTuning {
  readonly oxygenAmbient: number;
  readonly burnOxygenConsumePerTick: number;
  readonly oxygenWeakenThreshold: number;
  readonly oxygenExtinguishThreshold: number;
  readonly burnIntensityGrowthPerTick: number;
  readonly burnIntensityWeakenPerTick: number;
  readonly smokeFromOxygenConsume: number;
  readonly oxygenRecoveryPerTick: number;
}

export const DEFAULT_ATMOSPHERE: AtmosphereTuning = {
  oxygenAmbient: 100,
  burnOxygenConsumePerTick: 3,
  oxygenWeakenThreshold: 50,
  oxygenExtinguishThreshold: 10,
  burnIntensityGrowthPerTick: 2,
  burnIntensityWeakenPerTick: 6,
  smokeFromOxygenConsume: 1,
  oxygenRecoveryPerTick: 1.5,
};

/**
 * Fração da intensidade `smoky` que reduz O₂ derivado (campo ausente).
 * 1:1 apagava chama logo após `smother` (fumaça 80) — correlação, não identidade.
 */
export const SMOKE_OXYGEN_CORRELATION = 0.35;

/** Oxigênio efetivo 0–100. */
export function effectiveOxygen(target: ReactiveTarget, ambient: number): number {
  if (target.oxygen !== undefined) {
    return clamp01_100(target.oxygen);
  }
  const smoky = stateOf(target, 'smoky')?.intensity ?? 0;
  return clamp01_100(ambient - smoky * SMOKE_OXYGEN_CORRELATION);
}

/** Fator 0–1 para crescimento de intensidade e eficácia de alastramento. */
export function oxygenFactor(oxygen: number, ambient: number, weakenAt: number): number {
  const teto = Math.max(1, ambient);
  if (oxygen >= weakenAt) return Math.min(1, oxygen / teto);
  // Abaixo do limiar de enfraquecimento: cai mais rápido até zero no apagar.
  return Math.max(0, oxygen / Math.max(1, weakenAt));
}

export function consumeOxygenOnBurn(
  target: ReactiveTarget,
  burningIntensity: number,
  tuning: AtmosphereTuning,
): { consumed: number; oxygenAfter: number } {
  const ambient = tuning.oxygenAmbient;
  const before = effectiveOxygen(target, ambient);
  const rate = tuning.burnOxygenConsumePerTick * (Math.max(0, burningIntensity) / 100);
  const consumed = Math.min(before, rate);
  const after = clamp01_100(before - consumed);
  target.oxygen = after;
  if (consumed > 0 && tuning.smokeFromOxygenConsume > 0) {
    emitSmoke(target, consumed * tuning.smokeFromOxygenConsume);
  }
  return { consumed, oxygenAfter: after };
}

/** Recupera oxigênio em alvo sem chama (sem difusão — só respiração local). */
export function recoverOxygen(target: ReactiveTarget, tuning: AtmosphereTuning): boolean {
  if (target.oxygen === undefined) return false;
  const ambient = tuning.oxygenAmbient;
  if (target.oxygen >= ambient - 1e-6) {
    delete target.oxygen;
    return true;
  }
  target.oxygen = clamp01_100(target.oxygen + tuning.oxygenRecoveryPerTick);
  if (target.oxygen >= ambient - 1e-6) {
    delete target.oxygen;
  }
  return true;
}

/**
 * Ajusta intensidade de `burning` conforme O₂.
 * Devolve `'extinguish'` quando cai abaixo do limiar de apagar.
 */
export function modulateBurnIntensity(
  target: ReactiveTarget,
  tuning: AtmosphereTuning,
): 'extinguish' | 'changed' | 'noop' {
  const burning = stateOf(target, 'burning');
  if (!burning || burning.intensity <= 0) return 'noop';

  const o2 = effectiveOxygen(target, tuning.oxygenAmbient);
  if (o2 <= tuning.oxygenExtinguishThreshold) {
    return 'extinguish';
  }

  const factor = oxygenFactor(o2, tuning.oxygenAmbient, tuning.oxygenWeakenThreshold);
  const before = burning.intensity;
  if (o2 >= tuning.oxygenWeakenThreshold) {
    burning.intensity = Math.min(100, before + tuning.burnIntensityGrowthPerTick * factor);
  } else {
    const pena = tuning.burnIntensityWeakenPerTick * (1 - factor);
    burning.intensity = Math.max(0, before - pena);
    if (burning.intensity <= 0) return 'extinguish';
  }
  return burning.intensity !== before ? 'changed' : 'noop';
}

function emitSmoke(target: ReactiveTarget, amount: number): void {
  if (amount <= 0) return;
  const smoky = stateOf(target, 'smoky');
  if (smoky) {
    smoky.intensity = Math.min(100, smoky.intensity + amount);
  } else {
    target.states.push({ type: 'smoky', intensity: Math.min(100, amount) });
  }
}

function clamp01_100(n: number): number {
  return Math.max(0, Math.min(100, n));
}
