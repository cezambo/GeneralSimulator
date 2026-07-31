/**
 * Funcionamento da parte e capacidades derivadas. B-012, B-013, B-016, B-055.
 *
 * Nada aqui é atribuído. Tudo é calculado a partir do conjunto de partes vivas
 * e condições ativas, e a única entrada de fisiologia nova é o funcionamento
 * da parte — a porta única de B-055, que já traz dentro de si dano, idade
 * biológica e toxicidade. Nenhuma capacidade precisa saber que veneno existe.
 */

import type { BodyPartState, Condition } from '../types/domain.js';
import { effectiveModifiers, type ConditionCatalog } from './conditions.js';
import type { AgingCurve, BodyPlan, PartDef } from './plan.js';

/**
 * Anos após o início em que a curva acelerada iguala a linear, e em que a
 * curva de degrau entrega toda a sua perda de uma vez. Uma referência só, para
 * que as três formas sejam comparáveis com o mesmo `lossPerYear`.
 */
const AGING_REFERENCE_YEARS = 20;

export interface CapacityReading {
  readonly values: Readonly<Record<string, number>>;
  readonly pain: number;
  readonly unconscious: boolean;
  /** Capacidades vitais que zeraram. Vazio num corpo que não está morrendo. B-004. */
  readonly zeroedVital: readonly string[];
}

export interface CapacityInput {
  readonly parts: readonly BodyPartState[];
  readonly conditions: readonly Condition[];
  /** Multiplicador de percepção de dor da personalidade. 1 é neutro. B-016. */
  readonly painFactor?: number;
  /** Eficiência de uma parte artificial, que pode passar de 1. B-005. */
  readonly prostheticEfficiency?: (prostheticId: string) => number;
}

/**
 * Quanto uma parte ainda entrega, de 0 a 1. B-055.
 *
 * A fração de vida é transformada entre dois pontos declarados pela classe:
 * acima da sensibilidade vale 1, abaixo da resiliência vale 0, e entre as duas
 * interpola linearmente. O sentido de um deles é contraintuitivo e vale
 * repetir: resiliência **baixa** é parte que continua entregando com quase
 * nada de vida — o músculo, que trabalha machucado.
 *
 * Condições que reduzem a eficiência da parte não entram aqui: elas são efeito
 * de condição, e chegam à capacidade pelo caminho das condições, em
 * `partContribution`. Este número é só dano, idade e toxicidade.
 */
export function functioning(
  def: PartDef,
  state: BodyPartState | undefined,
  input: CapacityInput = { parts: [], conditions: [] },
): number {
  if (!state || state.missing === true || state.destroyed === true) return 0;

  if (state.prostheticId && input.prostheticEfficiency) {
    return Math.max(0, input.prostheticEfficiency(state.prostheticId));
  }

  const { sensitivity, resilience } = def.constants;
  const frac = def.maxHealth > 0 ? clamp01(state.health / def.maxHealth) : 1;

  let base: number;
  if (frac >= sensitivity) base = 1;
  else if (frac <= resilience) base = 0;
  // Sensibilidade igual à resiliência é degrau, e é legítimo: a parte serve
  // inteira até um ponto e para. Sem esta guarda seria divisão por zero.
  else if (sensitivity === resilience) base = 0;
  else base = (frac - resilience) / (sensitivity - resilience);

  return clamp01(base * agingFactor(state.biologicalAge ?? 0, def.aging) * (1 - clamp01(state.toxicity ?? 0)));
}

/**
 * Quanto do funcionamento chega à capacidade, depois das condições que
 * incidem sobre aquela parte. Multiplicativo, e o menor vence quando há mais
 * de uma: duas fraturas na mesma perna não somam eficiências.
 */
export function partContribution(
  def: PartDef,
  state: BodyPartState | undefined,
  conditions: readonly Condition[],
  catalog: ConditionCatalog,
  input: CapacityInput,
): number {
  let valor = functioning(def, state, input);
  if (valor === 0) return 0;
  for (const c of conditions) {
    if (c.partId !== def.id) continue;
    const mod = effectiveModifiers(catalog.get(c.defId), c.severity);
    if (mod.partEfficiency !== undefined) valor *= mod.partEfficiency;
  }
  return clamp01(valor);
}

/**
 * O fator de comprometimento por idade biológica, de 0 a 1. B-058.
 *
 * A velocidade e a **forma** vêm da classe, e a forma é configurável porque
 * rim e cérebro não decaem no mesmo desenho. Com uma curva só, a idade
 * biológica não diria nada que a idade cronológica já não dissesse.
 */
export function agingFactor(biologicalAge: number, curva: AgingCurve): number {
  const anos = biologicalAge - curva.onsetAge;
  if (anos <= 0) return 1;

  let perda: number;
  switch (curva.shape) {
    case 'linear':
      perda = curva.lossPerYear * anos;
      break;
    case 'accelerating':
      perda = (curva.lossPerYear * anos * anos) / AGING_REFERENCE_YEARS;
      break;
    case 'threshold':
      perda = curva.lossPerYear * AGING_REFERENCE_YEARS;
      break;
    default:
      perda = curva.lossPerYear * anos;
  }
  return clamp01(1 - perda);
}

/** A dor sentida: soma das condições ativas, modulada pela personalidade. B-016. */
export function totalPain(
  conditions: readonly Condition[],
  catalog: ConditionCatalog,
  painFactor = 1,
): number {
  let soma = 0;
  for (const c of conditions) soma += effectiveModifiers(catalog.get(c.defId), c.severity).pain;
  return clamp01(soma * painFactor);
}

/**
 * Calcula todas as capacidades. B-012, B-013.
 *
 * Três passagens, e não um resolvedor de grafo: as capacidades servidas por
 * parte, depois a consciência que lê algumas delas, depois as que a
 * consciência multiplica. É o gargalo de B-013 — um pulmão perfurado chega à
 * firmeza da mão sem que exista regra ligando pulmão a mão.
 *
 * O peso declarado é importância relativa, e a soma ponderada é **normalizada
 * pelo total dos pesos**. É o que faz as duas promessas do documento serem
 * verdadeiras ao mesmo tempo: um corpo íntegro entrega 1, e perder uma perna
 * corta o movimento pela metade exata. Sem normalizar, o total de 1,4 da
 * locomoção teria de ser aparado em 1 e a perna perdida custaria 0,3.
 */
export function computeCapacities(
  plan: BodyPlan,
  catalog: ConditionCatalog,
  input: CapacityInput,
): CapacityReading {
  const porId = new Map(input.parts.map((p) => [p.partId, p]));
  const contribuicao = new Map<string, number>();
  for (const def of plan.parts) {
    contribuicao.set(
      def.id,
      partContribution(def, porId.get(def.id), input.conditions, catalog, input),
    );
  }

  const offsets = new Map<string, number>();
  const tetos = new Map<string, number>();
  for (const c of input.conditions) {
    const mod = effectiveModifiers(catalog.get(c.defId), c.severity);
    for (const [cap, v] of Object.entries(mod.capacityOffsets)) {
      offsets.set(cap, (offsets.get(cap) ?? 0) + v);
    }
    for (const [cap, v] of Object.entries(mod.capacityMax)) {
      tetos.set(cap, Math.min(tetos.get(cap) ?? Infinity, v));
    }
  }

  const pain = totalPain(input.conditions, catalog, input.painFactor ?? 1);
  const values: Record<string, number> = {};

  const finalizar = (cap: string, bruto: number): number => {
    const v = clamp01(bruto + (offsets.get(cap) ?? 0));
    return Math.min(v, tetos.get(cap) ?? 1);
  };

  for (const cap of plan.evaluationOrder) {
    const regra = plan.rules.get(cap)!;

    if (!regra.sources) {
      const servindo = plan.serving(cap);
      const total = servindo.reduce((t, s) => t + s.weight, 0);
      const soma = servindo.reduce((t, s) => t + s.weight * contribuicao.get(s.part.id)!, 0);
      values[cap] = finalizar(cap, total > 0 ? soma / total : 0);
      continue;
    }

    const total = regra.sources.reduce((t, s) => t + s.weight, 0);
    const soma = regra.sources.reduce((t, s) => {
      const v = s.kind === 'part' ? (contribuicao.get(s.id) ?? 0) : (values[s.id] ?? 0);
      return t + s.weight * v;
    }, 0);
    let bruto = total > 0 ? soma / total : 0;

    if (regra.painPenalty) {
      const { floor, divisor, maxPenalty } = regra.painPenalty;
      // O piso existe para que arranhões não deixem ninguém tonto.
      bruto -= Math.min(maxPenalty, Math.max(0, (pain - floor) / divisor));
    }
    values[cap] = finalizar(cap, bruto);
  }

  for (const cap of plan.capacities) {
    const regra = plan.rules.get(cap)!;
    if (!regra.multipliedByConsciousness && regra.alsoAffectedBy.length === 0) continue;
    let v = values[cap]!;
    if (regra.multipliedByConsciousness) v *= values['consciousness'] ?? 1;
    for (const outra of regra.alsoAffectedBy) v *= values[outra] ?? 1;
    values[cap] = Math.min(clamp01(v), tetos.get(cap) ?? 1);
  }

  const consciencia = plan.rules.get('consciousness');
  const zeroedVital = plan.capacities.filter((c) => plan.rules.get(c)!.vital && values[c] === 0);

  return {
    values,
    pain,
    unconscious:
      consciencia?.unconsciousBelow !== undefined &&
      (values['consciousness'] ?? 1) < consciencia.unconsciousBelow,
    zeroedVital,
  };
}

/**
 * A integridade de cada sistema fisiológico. B-061.
 *
 * Derivada das capacidades que o compõem, e não de uma segunda lista de órgãos
 * que alguém teria de manter em sincronia com a primeira. É camada de leitura:
 * não muda nenhum número, e existe para que "o sistema excretor está falhando"
 * seja uma frase dizível pela UI, pelo log e pelo prompt do Validador.
 */
export function systemIntegrity(
  plan: BodyPlan,
  values: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of plan.systems) {
    if (s.capacities.length === 0) {
      out[s.id] = 1;
      continue;
    }
    out[s.id] = s.capacities.reduce((t, c) => t + (values[c] ?? 0), 0) / s.capacities.length;
  }
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
