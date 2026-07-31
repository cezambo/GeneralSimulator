import { isEffectId } from '../substrate/index.js';
import type { PlausibilityRegistry, WorldMutation } from '../types/domain.js';
import { findDerivedWrites } from './derived.js';

/**
 * O guarda de mutação. V-005, V-007, V-013, V-016, V-020.
 *
 * Uma mutação recusada não é erro de execução: ela é descartada, registrada na
 * trilha de auditoria (V-029) e o resto do julgamento vale. O que V-032 proíbe é
 * travar a simulação ou aplicar meia mutação — não é descartar uma mutação
 * inválida entre várias válidas, que é exatamente o que o campo "mutações
 * rejeitadas" da trilha existe para guardar.
 */

export interface MutationRejection {
  readonly mutation: WorldMutation;
  readonly requirement: string;
  readonly reason: string;
}

export interface MutationScreening {
  readonly accepted: readonly WorldMutation[];
  readonly rejected: readonly MutationRejection[];
}

export interface ScreeningContext {
  readonly plausibility: PlausibilityRegistry;
  /**
   * Já existe caminho causal modelado para este efeito sobre este alvo?
   *
   * É o gancho de R-044 no substrato. Devolvendo o identificador da regra, a
   * mutação é recusada: invocar sobre algo que a matriz já resolveria aplica o
   * efeito duas vezes, e o sintoma não é erro — é uma cortina que pega fogo com
   * o dobro da intensidade e ninguém sabe por quê.
   */
  readonly alreadyModelled?: (mutation: WorldMutation) => string | undefined;
  /** Operações biológicas de B-037, que compartilham o campo `effectId` com R-015. */
  readonly bodyOperations?: ReadonlySet<string>;
}

export function screenMutations(
  mutations: readonly WorldMutation[],
  ctx: ScreeningContext,
): MutationScreening {
  const aceitas: WorldMutation[] = [];
  const recusadas: MutationRejection[] = [];

  const reject = (mutation: WorldMutation, requirement: string, reason: string): void => {
    recusadas.push({ mutation, requirement, reason });
  };

  for (const m of mutations) {
    const derivados = findDerivedWrites(m.changes);
    if (derivados.length > 0) {
      reject(
        m,
        'V-013',
        `escreve em campo derivado (${derivados.join(', ')}). ` +
          `Campo derivado é recalculado e a escrita seria apagada em silêncio — ` +
          `escreva a causa: condição, material de parte, presença de parte ou substância.`,
      );
      continue;
    }

    if (m.type !== 'engine_effect') {
      aceitas.push(m);
      continue;
    }

    const efeito = m.effectId;
    if (!efeito) {
      reject(m, 'R-043', 'engine_effect sem effectId');
      continue;
    }
    if (!isEffectId(efeito) && !ctx.bodyOperations?.has(efeito)) {
      reject(m, 'R-015', `"${efeito}" não está no vocabulário fechado de efeitos nem nas operações de B-037`);
      continue;
    }
    if (!isOperationAllowed(efeito, ctx.plausibility)) {
      // O cenário é quem decide o gênero do mundo, e não o modelo a cada
      // chamada: a engine sempre sabe transmutar ossos, e é o registro que diz
      // se este mundo permite. Deriva tonal é o modo de falha mais difícil de
      // recuperar num mediador de LLM.
      reject(
        m,
        'V-016',
        `a operação "${efeito}" não consta no registro de plausibilidade deste cenário`,
      );
      continue;
    }
    if (!citesTheGap(m.rationale)) {
      reject(
        m,
        'V-020',
        'engine_effect precisa de justificativa que explique por que nenhuma regra existente cobria o caso',
      );
      continue;
    }
    const regra = ctx.alreadyModelled?.(m);
    if (regra) {
      reject(m, 'R-044', `a matriz já resolve este caso pela regra "${regra}"; invocar aplicaria o efeito duas vezes`);
      continue;
    }

    aceitas.push(m);
  }

  return { accepted: aceitas, rejected: recusadas };
}

function isOperationAllowed(effectId: string, registry: PlausibilityRegistry): boolean {
  if (registry.forbiddenOperations?.includes(effectId)) return false;
  return registry.allowedOperations.includes(effectId);
}

/**
 * A justificativa aponta a lacuna? V-020.
 *
 * A conferência é de substância mínima, e não de conteúdo: exigir que o texto
 * seja *correto* seria pedir a um verificador determinístico que julgasse
 * julgamento. O que dá para exigir é que exista e diga algo — e isso já é o que
 * torna a duplicação detectável em auditoria em vez de invisível, que é o que o
 * requisito pede.
 */
function citesTheGap(rationale: string | undefined): boolean {
  return typeof rationale === 'string' && rationale.trim().length >= 12;
}

/**
 * Narrativa sem mutação não altera nada. V-005.
 *
 * Um veredito `executed` que não emite mutação nem consequência descreve uma
 * mudança que não aconteceu, e o agente recebe um retorno que mente. Ação que
 * de fato não muda nada não deveria ter chegado aqui: ela resolveria por
 * affordance (V-002), sem custo nenhum.
 */
export function describesChangeWithoutMutating(
  verdict: string,
  mutations: readonly unknown[],
  consequences: readonly unknown[] | undefined,
): boolean {
  return verdict === 'executed' && mutations.length === 0 && (consequences?.length ?? 0) === 0;
}
