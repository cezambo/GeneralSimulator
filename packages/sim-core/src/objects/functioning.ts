/**
 * Funcionamento determinístico. O-021, V-002.
 *
 * Se a intenção casa com uma regra do ObjectDef, a engine resolve sem LLM.
 * A recusa importa tanto quanto a permissão: "a lâmina desliza na pedra sem
 * morder" ensina, e é dado, não chamada.
 */

import type { ItemRule, ObjectDef } from '../types/domain.js';

export interface FunctionAttempt {
  /** Affordance ou verbo da tentativa. */
  readonly action: string;
  /** Contexto livre opcional (material do alvo, etc.). */
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface FunctionResult {
  readonly matched: boolean;
  readonly rule?: ItemRule;
  readonly outcome?: ItemRule['outcome'];
  readonly diegeticText?: string;
  readonly effectId?: string;
}

/**
 * Primeira regra cujo trigger casa. Regras `rejected` são ignoradas.
 *
 * O trigger é um objeto aberto: casa se **todas** as chaves declaradas batem
 * com o attempt (action e context). Chaves a mais no attempt não atrapalham.
 */
export function resolveFunction(def: ObjectDef, attempt: FunctionAttempt): FunctionResult {
  const rules = def.functionRules ?? [];
  for (const rule of rules) {
    if (rule.state === 'rejected') continue;
    if (!triggerMatches(rule.trigger, attempt)) continue;
    return {
      matched: true,
      rule,
      outcome: rule.outcome,
      ...(rule.diegeticText !== undefined ? { diegeticText: rule.diegeticText } : {}),
      ...(rule.effectId !== undefined ? { effectId: rule.effectId } : {}),
    };
  }
  return { matched: false };
}

function triggerMatches(
  trigger: Record<string, unknown>,
  attempt: FunctionAttempt,
): boolean {
  for (const [k, expected] of Object.entries(trigger)) {
    if (k === 'action' || k === 'affordance') {
      if (attempt.action !== expected) return false;
      continue;
    }
    const atual = attempt.context?.[k];
    if (atual !== expected) return false;
  }
  return true;
}
