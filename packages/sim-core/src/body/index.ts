/**
 * O corpo de um agente. SPEC-B.
 *
 * O corpo não é um sistema novo: é o substrato reativo rodando sobre outra
 * topologia — uma árvore de vinte e poucos nós em vez de um grid de milhares.
 * Parte é tile, condição é estado transiente, cascata pela árvore é propagação
 * por vizinhança, e o catálogo de materiais é literalmente o mesmo.
 *
 * A disciplina de custo é a mesma também, e é condição de existência: só entra
 * no laço quem tem condição de cadência não-estática ou toxicidade fora de
 * equilíbrio (B-046, B-063). Um agente íntegro não é visitado, e as
 * capacidades só são recalculadas quando o conjunto de partes vivas e
 * condições ativas muda (B-015).
 */

import type { Rng } from '../rng/index.js';
import type { MaterialLookup, ReactiveTarget } from '../substrate/target.js';
import type { BodyPartState, CausalEntry, Condition, DamageType } from '../types/domain.js';
import {
  computeCapacities,
  functioning,
  systemIntegrity,
  type CapacityReading,
} from './capacities.js';
import { effectiveModifiers, type Cadence, type ConditionCatalog } from './conditions.js';
import { bleedRateFor, selectHitPart, type InjuryMatrix, type InjuryTuning } from './injury.js';
import type { BodyPlan, PartDef } from './plan.js';

export * from './plan.js';
export * from './conditions.js';
export * from './capacities.js';
export * from './injury.js';

export interface BodyTuning {
  /**
   * Quantas vezes o próprio acúmulo de cada parte uma excreção plena remove.
   * B-059, B-060.
   *
   * A remoção é **proporcional ao acúmulo da parte**, e não uma taxa absoluta
   * igual para todas. É o que faz a frase de B-060 ser literalmente verdadeira:
   * o saldo de toda parte é `taxa × (1 − fator × filtragem)`, então todas
   * viram de positivo para negativo no mesmo instante — "o acúmulo vence em
   * todas as partes de uma vez". Com uma taxa absoluta, osso e músculo
   * continuariam limpos enquanto o fígado apodrecia, e a falência seria local
   * quando o requisito diz que é sistêmica.
   *
   * O valor decide o limiar, que é `1 / fator` de filtragem. Em 1,5 o limiar
   * fica em dois terços, e daí sai a outra frase do requisito sem nenhuma
   * regra escrita sobre rins: com um rim a menos a filtragem cai a 0,75 e a
   * remoção ainda vence; com os dois, cai a 0,5 e a corrida se inverte.
   */
  readonly toxicityClearanceFactor: number;
  readonly injury: InjuryTuning;
}

export const DEFAULT_BODY_TUNING: BodyTuning = {
  toxicityClearanceFactor: 1.5,
  injury: { penetrationChance: 0.35, targetBias: 0.7, compromisedBelow: 0.4 },
};

export interface DeathRecord {
  readonly simTime: number;
  /** Em vocabulário fechado, para que a causa seja consultável e não lida. B-029. */
  readonly kind: 'vital_part_destroyed' | 'vital_capacity_zeroed' | 'lethal_condition';
  readonly partId?: string;
  readonly capacity?: string;
  readonly conditionId?: string;
}

export interface BodyOptions {
  readonly agentId: string;
  readonly plan: BodyPlan;
  readonly catalog: ConditionCatalog;
  readonly materials: MaterialLookup;
  readonly matrix: InjuryMatrix;
  readonly tuning?: BodyTuning;
  readonly painFactor?: number;
  readonly prostheticEfficiency?: (prostheticId: string) => number;
  readonly onCausal?: (entry: CausalEntry) => void;
  readonly parts?: readonly BodyPartState[];
  readonly conditions?: readonly Condition[];
}

export interface TickInput {
  readonly cadence: Exclude<Cadence, 'static'>;
  readonly hoursElapsed: number;
  readonly simTime: number;
  readonly rng: Rng;
  /** Escalares de fora do corpo que governam certas condições: fome, energia, temperatura. */
  readonly drivers?: Readonly<Record<string, number>>;
  readonly resting?: boolean;
}

export class Body {
  readonly agentId: string;
  readonly plan: BodyPlan;
  readonly #catalog: ConditionCatalog;
  readonly #materials: MaterialLookup;
  readonly #matrix: InjuryMatrix;
  readonly #tuning: BodyTuning;
  readonly #painFactor: number;
  readonly #prostheticEfficiency: ((id: string) => number) | undefined;
  readonly #onCausal: ((entry: CausalEntry) => void) | undefined;

  #parts: BodyPartState[];
  #conditions: Condition[];
  #reading: CapacityReading | undefined;
  #recomputes = 0;
  #death: DeathRecord | undefined;
  /** O instante mais recente que passou por aqui, para datar a morte por capacidade. */
  #simTime = 0;

  constructor(options: BodyOptions) {
    this.agentId = options.agentId;
    this.plan = options.plan;
    this.#catalog = options.catalog;
    this.#materials = options.materials;
    this.#matrix = options.matrix;
    this.#tuning = options.tuning ?? DEFAULT_BODY_TUNING;
    this.#painFactor = options.painFactor ?? 1;
    this.#prostheticEfficiency = options.prostheticEfficiency;
    this.#onCausal = options.onCausal;

    // Vetor de tamanho fixo indexado pela ordem do plano, e não grafo de
    // ponteiros: o estado de saúde cabe num bloco contíguo e serializa sem
    // travessia (B-048).
    const fornecidas = new Map((options.parts ?? []).map((p) => [p.partId, p]));
    this.#parts = this.plan.parts.map(
      (def) => fornecidas.get(def.id) ?? { partId: def.id, health: def.maxHealth },
    );
    this.#conditions = [...(options.conditions ?? [])];
  }

  get parts(): readonly BodyPartState[] {
    return this.#parts;
  }

  get conditions(): readonly Condition[] {
    return this.#conditions;
  }

  get death(): DeathRecord | undefined {
    return this.#death;
  }

  /**
   * Estar vivo é um derivado, e por isso ler isto força o recálculo pendente.
   *
   * Morte por capacidade vital zerada (B-004) só pode ser sabida depois de as
   * capacidades serem calculadas, e elas são calculadas por invalidação
   * (B-015). Responder sem calcular diria "vivo" sobre um agente cujo último
   * pulmão acabou de sair — e diria isso até alguém consultar uma capacidade,
   * o que é a pior forma possível de errar: a resposta certa existia e não foi
   * procurada. Num corpo estável nada invalidou e nada é recalculado aqui.
   */
  get isAlive(): boolean {
    if (this.#death === undefined) void this.capacities;
    return this.#death === undefined;
  }

  /** Quantas vezes as capacidades foram recalculadas. Diagnóstico de B-015. */
  get recomputes(): number {
    return this.#recomputes;
  }

  get capacities(): CapacityReading {
    if (!this.#reading) {
      this.#recomputes += 1;
      this.#reading = computeCapacities(this.plan, this.#catalog, {
        parts: this.#parts,
        conditions: this.#conditions,
        painFactor: this.#painFactor,
        ...(this.#prostheticEfficiency ? { prostheticEfficiency: this.#prostheticEfficiency } : {}),
      });
      this.#checkVitalCapacities();
    }
    return this.#reading;
  }

  capacity(id: string): number {
    return this.capacities.values[id] ?? 0;
  }

  systems(): Record<string, number> {
    return systemIntegrity(this.plan, this.capacities.values);
  }

  functioningOf(partId: string): number {
    const def = this.plan.part(partId);
    return functioning(def, this.stateOf(partId), {
      parts: this.#parts,
      conditions: this.#conditions,
      ...(this.#prostheticEfficiency ? { prostheticEfficiency: this.#prostheticEfficiency } : {}),
    });
  }

  stateOf(partId: string): BodyPartState {
    return this.#parts[this.plan.part(partId).index]!;
  }

  /**
   * Está no laço de saúde? B-046, B-063.
   *
   * Duas razões, e só duas: alguma condição de cadência não-estática, ou a
   * corrida de toxicidade fora de equilíbrio. Um agente com cinco cicatrizes e
   * uma perna faltando responde não — as condições existem, modificam
   * capacidades, aparecem na descrição, e custam zero por tick.
   */
  isActive(): boolean {
    if (!this.isAlive) return false;
    if (this.#conditions.some((c) => this.#catalog.get(c.defId).cadence !== 'static')) return true;
    return !this.#toxicityAtEquilibrium();
  }

  // --- Mutação de causa. O que a engine e o Validador podem escrever. B-036, B-037.

  /** `damage_part`. Zerar a vida destrói, e destruir cascateia. B-004, B-037. */
  damagePart(partId: string, amount: number, simTime: number, ref = 'damage_part'): void {
    const def = this.plan.part(partId);
    const state = this.#parts[def.index]!;
    if (state.missing === true) return;
    const nova = Math.max(0, state.health - amount);
    if (nova === state.health) return;
    // Quem marca `destroyed` é a cascata, e não esta linha: marcar aqui faria
    // a raiz da cascata ser vista como já destruída e sair do log.
    this.#parts[def.index] = { ...state, health: nova };
    this.#invalidate();
    this.#log(simTime, ref, 'part_damaged', partId);
    if (nova === 0) this.#destroy(def, simTime, ref);
  }

  /** `heal_part`, com o teto de regeneração da classe. B-037, B-057. */
  healPart(partId: string, amount: number, simTime: number, ref = 'heal_part'): void {
    const def = this.plan.part(partId);
    const state = this.#parts[def.index]!;
    if (state.missing === true || state.destroyed === true) return;
    const teto = def.maxHealth * def.constants.regenCeiling;
    const nova = Math.min(teto, state.health + amount);
    if (nova === state.health) return;
    this.#parts[def.index] = { ...state, health: nova };
    this.#invalidate();
    this.#log(simTime, ref, 'part_healed', partId);
  }

  /** `sever_part`. B-037. */
  severPart(partId: string, simTime: number, ref = 'sever_part'): void {
    const def = this.plan.part(partId);
    this.#parts[def.index] = { ...this.#parts[def.index]!, health: 0, missing: true };
    this.#invalidate();
    this.#destroy(def, simTime, ref);
  }

  /**
   * `attach_part`. Recoloca ou substitui uma parte, incluindo próteses. B-005, B-037.
   *
   * É a única forma legítima de reverter a corrida de toxicidade de B-060:
   * recuperar a filtragem, e não escrever no derivado. Uma prótese entra por
   * aqui com o identificador, e a eficiência dela pode passar de 100%.
   */
  attachPart(
    partId: string,
    options: { readonly simTime: number; readonly prostheticId?: string; readonly health?: number } ,
  ): void {
    const def = this.plan.part(partId);
    const teto = def.maxHealth * def.constants.regenCeiling;
    this.#parts[def.index] = {
      partId,
      health: Math.min(options.health ?? teto, def.maxHealth),
      ...(options.prostheticId ? { prostheticId: options.prostheticId } : {}),
    };
    this.#invalidate();
    this.#log(options.simTime, 'attach_part', 'part_attached', partId);
  }

  /**
   * `transmute_part`. B-037, B-038, B-039.
   *
   * Uma linha, e o comportamento novo emerge sozinho: tudo que a lesão, a
   * temperatura, o peso e a percepção consultam já vinha do material. Não há
   * código para ossos de ferro em lugar nenhum.
   */
  transmutePart(partId: string, materialId: string, simTime: number, ref = 'transmute_part'): void {
    if (!this.#materials.has(materialId)) throw new Error(`material desconhecido: "${materialId}"`);
    const def = this.plan.part(partId);
    this.#parts[def.index] = { ...this.#parts[def.index]!, materialId };
    this.#invalidate();
    this.#log(simTime, ref, 'part_transmuted', partId);
  }

  /** `apply_condition`. A partir daqui a engine assume. B-037, B-040. */
  applyCondition(
    defId: string,
    options: {
      readonly partId?: string;
      readonly severity?: number;
      readonly sourceId?: string;
      readonly simTime: number;
      readonly ref?: string;
    },
  ): Condition {
    const def = this.#catalog.get(defId);
    const severity = options.severity ?? 0.1;
    const condition: Condition = {
      defId,
      severity,
      stage: Math.max(0, effectiveModifiers(def, severity).index),
      ...(def.wholeBody || !options.partId ? {} : { partId: options.partId }),
      ...(def.permanent ? { permanent: true } : {}),
      ...(options.sourceId ? { sourceId: options.sourceId } : {}),
      onsetTick: Math.floor(options.simTime),
    };

    // Condição de corpo inteiro é uma só: aplicar perda de sangue duas vezes
    // criaria dois escalares somando na mesma capacidade.
    if (def.wholeBody) {
      const existente = this.#conditions.find((c) => c.defId === defId);
      if (existente) {
        this.#setSeverity(existente, Math.max(existente.severity, condition.severity));
        return existente;
      }
    }

    this.#conditions.push(condition);
    this.#invalidate();
    this.#log(options.simTime, options.ref ?? 'apply_condition', 'condition_applied', options.partId ?? this.agentId, def.wholeBody ? 'agent' : 'body_part');
    this.#checkLethalCondition(condition, options.simTime);
    return condition;
  }

  /** `worsen_condition` / `relieve_condition`. B-037. */
  moveSeverity(condition: Condition, delta: number, simTime: number): void {
    this.#setSeverity(condition, condition.severity + delta);
    this.#checkLethalCondition(condition, simTime);
  }

  /** `remove_condition`, com ou sem sequela. B-037. */
  removeCondition(condition: Condition, options: { simTime: number; rng?: Rng; sequela?: boolean } ): void {
    const i = this.#conditions.indexOf(condition);
    if (i < 0) return;
    this.#conditions.splice(i, 1);
    this.#invalidate();
    this.#log(options.simTime, 'remove_condition', 'condition_removed', condition.partId ?? this.agentId);

    const def = this.#catalog.get(condition.defId);
    const deixa = def.leavesOnHeal;
    if (!deixa || options.sequela === false || !options.rng) return;
    if (condition.severity < deixa.ifSeverityAbove) return;
    if (!options.rng.chance(deixa.chance)) return;
    this.applyCondition(deixa.condition, {
      ...(condition.partId ? { partId: condition.partId } : {}),
      severity: 1,
      simTime: options.simTime,
      ref: 'leaves_on_heal',
    });
  }

  setToxicity(partId: string, value: number, simTime: number): void {
    const def = this.plan.part(partId);
    const v = Math.max(0, Math.min(1, value));
    if (this.#parts[def.index]!.toxicity === v) return;
    this.#parts[def.index] = { ...this.#parts[def.index]!, toxicity: v };
    this.#invalidate();
    this.#log(simTime, 'toxicity', 'toxicity_changed', partId);
  }

  setBiologicalAge(partId: string, years: number, simTime: number): void {
    const def = this.plan.part(partId);
    if (this.#parts[def.index]!.biologicalAge === years) return;
    this.#parts[def.index] = { ...this.#parts[def.index]!, biologicalAge: years };
    this.#invalidate();
    this.#log(simTime, 'aging', 'biological_age_changed', partId);
  }

  // --- Lesão. B-020, B-021, B-022.

  /**
   * Uma agressão resolvida pela matriz. B-020, B-021, B-022.
   *
   * Estado de tile e evento físico entram por aqui como qualquer outro dano:
   * não existe caminho separado para dano ambiental. Atravessar um tile em
   * chamas produz queimadura na perna, e não um decremento de vitalidade.
   */
  injure(
    damage: DamageType,
    amount: number,
    input: {
      readonly rng: Rng;
      readonly simTime: number;
      readonly declaredTarget?: string;
      readonly sourceId?: string;
    },
  ): { readonly partId: string; readonly condition: Condition | undefined } | undefined {
    const alvo = selectHitPart(this.plan, this.#parts, damage, input.rng, {
      ...(input.declaredTarget ? { declaredTarget: input.declaredTarget } : {}),
      tuning: this.#tuning.injury,
    });
    if (!alvo) return undefined;

    const def = alvo.part;
    const state = this.#parts[def.index]!;
    const materialId = state.materialId ?? def.materialId;
    const regra = this.#matrix.match(damage, this.#asTarget(def, state), this.#materials, def.vital);

    this.damagePart(def.id, amount, input.simTime, 'injury_matrix');

    // Fallback: parte cujo material não é vivo não adoece nem cicatriza —
    // apenas perde integridade, como qualquer objeto. É a consequência
    // automática de transmutar uma parte para material morto (B-020, B-039).
    if (!regra || regra.condition === null) return { partId: def.id, condition: undefined };

    const severidade = Math.max(0.05, Math.min(1, amount / Math.max(1, def.maxHealth)));
    const condition = this.applyCondition(regra.condition, {
      partId: def.id,
      severity: severidade,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      simTime: input.simTime,
      ref: `injury_matrix:${regra.index}`,
    });

    const taxa = bleedRateFor(
      def,
      materialId,
      this.#materials,
      this.#catalog.get(regra.condition).bleedRateBySeverity,
      condition.severity,
      regra.bleed,
    );
    if (taxa > 0) {
      condition.bleedRate = taxa;
      this.#invalidate();
    }

    return { partId: def.id, condition };
  }

  // --- O laço. B-009, B-010, B-017, B-024, B-047, B-059.

  /**
   * Avança as condições de uma cadência. B-009, B-010, B-047.
   *
   * Quem decide quando chamar com `slow` é o relógio, e as chamadas lentas são
   * distribuídas entre os ticks para que o custo não apresente picos
   * sincronizados entre agentes.
   */
  tick(input: TickInput): void {
    // Antes da guarda de vida, porque é a leitura de `isAlive` que pode
    // descobrir a morte pendente, e ela precisa ser datada com o instante
    // corrente — não com o do último evento que passou pelo log.
    if (input.simTime > this.#simTime) this.#simTime = input.simTime;
    if (!this.isAlive) return;
    const dia = input.hoursElapsed / 24;

    for (const condition of [...this.#conditions]) {
      const def = this.#catalog.get(condition.defId);
      if (def.cadence !== input.cadence) continue;

      if (def.id === 'infection' || condition.immunity !== undefined) {
        this.#advanceRace(condition, dia, input);
        continue;
      }

      if (def.drivenBy) {
        this.#setSeverity(condition, this.#driverValue(def.drivenBy, input) ?? condition.severity);
      } else {
        this.#setSeverity(condition, condition.severity + def.progressPerDay * dia);
      }

      if (condition.severity <= 0) {
        this.removeCondition(condition, { simTime: input.simTime, rng: input.rng });
        continue;
      }
      this.#checkLethalCondition(condition, input.simTime);
      if (!this.isAlive) return;
    }

    if (input.cadence === 'fast') this.#advanceBloodLoss(dia, input);
    if (input.cadence === 'slow') this.#advanceToxicity(dia, input);
  }

  /**
   * A corrida da toxicidade. B-059, B-060.
   *
   * Com a excreção íntegra a remoção supera o acúmulo e a carga fica perto de
   * zero em toda parte — invisível e gratuita na vida de um agente saudável.
   * Quando a filtragem cai, o acúmulo vence **em todas as partes ao mesmo
   * tempo**: não morre o rim, morre o agente.
   */
  #advanceToxicity(dia: number, input: TickInput): void {
    // Saldo por parte: a própria taxa dela, escalada pelo quanto a excreção
    // deixou de dar conta. Uma conta só, e a virada é simultânea em todas.
    const saldo = 1 - this.#tuning.toxicityClearanceFactor * this.#filtrationDelivered();

    let mudou = false;
    let soma = 0;
    for (let i = 0; i < this.#parts.length; i += 1) {
      const def = this.plan.parts[i]!;
      const atual = this.#parts[i]!.toxicity ?? 0;
      const nova = Math.max(0, Math.min(1, atual + def.toxicityPerDay * saldo * dia));
      if (nova !== atual) {
        this.#parts[i] = { ...this.#parts[i]!, toxicity: nova };
        mudou = true;
      }
      soma += nova;
    }
    if (mudou) this.#invalidate();

    const media = soma / this.#parts.length;
    const existente = this.#conditions.find((c) => c.defId === 'toxicosis');
    if (media <= 0 && existente) {
      this.removeCondition(existente, { simTime: input.simTime, sequela: false });
      return;
    }
    if (media <= 0 || !this.#catalog.has('toxicosis')) return;
    if (existente) this.#setSeverity(existente, media);
    else this.applyCondition('toxicosis', { severity: media, simTime: input.simTime, ref: 'toxicity' });
  }

  /** Perda de sangue: sobe enquanto houver sangramento, desce quando parar. B-017. */
  #advanceBloodLoss(dia: number, input: TickInput): void {
    if (!this.#catalog.has('blood_loss')) return;
    const def = this.#catalog.get('blood_loss');
    const taxa = this.#conditions
      .filter((c) => c.defId !== 'blood_loss')
      .reduce((t, c) => t + (c.bleedRate ?? 0), 0);

    let condition = this.#conditions.find((c) => c.defId === 'blood_loss');
    if (taxa <= 0 && !condition) return;
    if (!condition) {
      condition = this.applyCondition('blood_loss', { severity: 0, simTime: input.simTime, ref: 'bleeding' });
    }

    const delta = taxa > 0 ? taxa * dia : (def.recoveryPerDay ?? -0.5) * dia;
    this.#setSeverity(condition, condition.severity + delta);
    if (condition.severity <= 0) {
      this.removeCondition(condition, { simTime: input.simTime, sequela: false });
      return;
    }
    this.#checkLethalCondition(condition, input.simTime);
  }

  /**
   * A corrida da infecção. B-024, B-025.
   *
   * A assimetria é o desenho inteiro: tratamento não acelera a imunidade,
   * desacelera a severidade; quem acelera a imunidade é descanso, nutrição e
   * filtragem sanguínea. Remédio sozinho não salva e descanso sozinho não
   * salva — é preciso alguém tratando **e** o doente aceitando ficar deitado.
   */
  #advanceRace(condition: Condition, dia: number, input: TickInput): void {
    const raw = this.#catalog.get(condition.defId).raw;
    const numero = (k: string, padrao: number): number =>
      typeof raw[k] === 'number' ? (raw[k] as number) : padrao;
    const modificadores = (raw['immunityModifiers'] as Record<string, number>) ?? {};

    const imune = (condition.immunity ?? 0) >= numero('curedWhenImmunityReaches', 1);
    let severidadePorDia = imune
      ? numero('severityPerDayWhenImmune', -0.7)
      : numero('severityPerDay', 0);
    if (!imune && condition.tendQuality !== undefined) {
      severidadePorDia -= numero('tendReducesSeverityPerDay', 0) * condition.tendQuality;
    }

    let imunidadePorDia = numero('immunityPerDay', 0);
    for (const [chave, peso] of Object.entries(modificadores)) {
      if (chave === 'resting') imunidadePorDia *= 1 + (input.resting ? peso : 0);
      else if (this.plan.capacities.includes(chave)) imunidadePorDia *= 1 - peso * (1 - this.capacity(chave));
      else if (this.#conditions.some((c) => c.defId === chave)) imunidadePorDia *= 1 + peso;
    }

    condition.immunity = Math.max(0, Math.min(1, (condition.immunity ?? 0) + imunidadePorDia * dia));
    this.#setSeverity(condition, condition.severity + severidadePorDia * dia);

    if (condition.severity <= 0) {
      this.removeCondition(condition, { simTime: input.simTime, rng: input.rng });
      return;
    }
    this.#checkLethalCondition(condition, input.simTime);
  }

  // --- Internos.

  #setSeverity(condition: Condition, valor: number): void {
    const v = Math.max(0, Math.min(1, valor));
    if (v === condition.severity) return;
    condition.severity = v;
    // `stage` é derivado, e é o guarda de mutação de V-013 que impede o
    // Validador de escrevê-lo. Aqui é a engine que o mantém coerente com a
    // severidade, que é a causa.
    condition.stage = Math.max(0, effectiveModifiers(this.#catalog.get(condition.defId), v).index);
    this.#invalidate();
  }

  #invalidate(): void {
    this.#reading = undefined;
  }

  /**
   * Cascata estrutural. B-004.
   *
   * Destruir uma parte destrói seus filhos; destruir uma parte vital mata. É a
   * única forma pela qual uma parte afeta outra diretamente — fora dela vale
   * "condição altera parte, condição altera condição, parte não altera parte".
   */
  #destroy(def: PartDef, simTime: number, ref: string): void {
    for (const i of this.plan.subtreeOf(def.index)) {
      const filho = this.#parts[i]!;
      if (filho.destroyed === true) continue;
      this.#parts[i] = { ...filho, health: 0, destroyed: true };
      this.#log(simTime, ref, 'part_destroyed', this.plan.parts[i]!.id);
    }
    this.#invalidate();

    const vital = this.plan
      .subtreeOf(def.index)
      .map((i) => this.plan.parts[i]!)
      .find((p) => p.vital);
    if (vital && !this.#death) {
      this.#die({ simTime, kind: 'vital_part_destroyed', partId: vital.id });
    }
  }

  #checkVitalCapacities(): void {
    if (this.#death || !this.#reading) return;
    const zerada = this.#reading.zeroedVital[0];
    if (zerada) {
      this.#die({ simTime: this.#simTime, kind: 'vital_capacity_zeroed', capacity: zerada });
    }
  }

  #checkLethalCondition(condition: Condition, simTime: number): void {
    const def = this.#catalog.get(condition.defId);
    if (def.lethalAt === undefined || condition.severity < def.lethalAt) return;
    this.#die({ simTime, kind: 'lethal_condition', conditionId: def.id });
  }

  #die(record: DeathRecord): void {
    if (this.#death) return;
    this.#death = record;
    this.#log(record.simTime, record.kind, 'death', this.agentId, 'agent');
  }

  #driverValue(driver: string, input: TickInput): number | undefined {
    return input.drivers?.[driver];
  }

  /**
   * A parte vista como alvo reativo. B-003.
   *
   * É a mesma interface do substrato, sem tradutor no meio: a matriz de lesão
   * consulta etiqueta de material pelo mesmo caminho que a matriz de reação.
   */
  #asTarget(def: PartDef, state: BodyPartState): ReactiveTarget {
    return {
      id: `${this.agentId}:${def.id}`,
      kind: 'body_part',
      materialId: state.materialId ?? def.materialId,
      states: [],
      integrity: def.maxHealth > 0 ? state.health / def.maxHealth : 1,
    };
  }

  #log(
    simTime: number,
    ref: string,
    effect: string,
    targetId: string,
    targetKind: CausalEntry['targetKind'] = 'body_part',
  ): void {
    if (simTime > this.#simTime) this.#simTime = simTime;
    this.#onCausal?.({
      simTime,
      cause: { kind: 'injury_matrix', ref },
      effect,
      targetKind,
      targetId,
    });
  }

  /** Quanto o sistema excretor ainda entrega, de 0 a 1. B-061. */
  #filtrationDelivered(): number {
    const sistema = this.plan.toxicityClearingSystem();
    if (!sistema || sistema.capacities.length === 0) return 1;
    return sistema.capacities.reduce((t, c) => t + this.capacity(c), 0) / sistema.capacities.length;
  }

  #toxicityAtEquilibrium(): boolean {
    if (this.#parts.some((p) => (p.toxicity ?? 0) > 0)) return false;
    return this.#tuning.toxicityClearanceFactor * this.#filtrationDelivered() >= 1;
  }
}
