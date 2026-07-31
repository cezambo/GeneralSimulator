import type { Rng } from '../rng/index.js';
import type { CausalEntry } from '../types/domain.js';
import { EffectCatalog, isEffectId, type EffectId } from './effects.js';
import { ReactionMatrix, type Occasion, type ReactionRule } from './matrix.js';
import { hasState, type MaterialLookup, type ReactiveTarget } from './target.js';

export * from './target.js';
export * from './matrix.js';
export * from './effects.js';
export { TileReactiveBridge, tileTargetId } from './world-bridge.js';

/**
 * O substrato reativo. R-014, R-017, R-047, R-048, R-049.
 *
 * Avalia a matriz sobre as entidades com estado ativo, a cada tick, **sem
 * consultar modelo em nenhuma circunstância**. Um incêndio completo, do início à
 * extinção, custa zero chamadas de LLM.
 */

/**
 * O que o substrato precisa saber do mundo, e nada além.
 *
 * Vizinhança entra como consulta e não como varredura de grid por dois motivos.
 * O primeiro é que o grid ainda não existe e o substrato não deveria esperar por
 * ele. O segundo é R-051: a vizinhança de uma célula ganha os vizinhos de cima e
 * de baixo, e a travessia entre grids passa a ser mudança de quem responde a
 * consulta — não mudança no motor.
 */
export interface WorldView {
  neighborsOf(target: ReactiveTarget): ReactiveTarget[];
  /** Quem divide a célula com o alvo. Alimenta a cascata de contato dentro do tick. */
  occupantsOf(target: ReactiveTarget): ReactiveTarget[];
  ambientTemperature(target: ReactiveTarget): number;
}

export interface SubstrateTuning {
  /** `substrato.decaimentoEstadoTransientePorTick`. */
  readonly stateDecayPerTick: number;
  /** `substrato.maxTilesAtivosSimultaneos`. */
  readonly maxActiveTargets: number;
  /** `substrato.toleranciaEquilibrioTermico`, em graus. */
  readonly thermalEquilibriumTolerance: number;
  /** `substrato.maxPassosDeCascataPorTick`. */
  readonly maxCascadeStepsPerTick: number;
  /**
   * `substrato.perdaIntegridadeQueimaPorTick`.
   * R-027: tile/objeto em chamas perde integridade a cada tick.
   */
  readonly burnIntegrityLossPerTick: number;
}

export interface SubstrateOptions {
  readonly materials: MaterialLookup;
  readonly matrix: ReactionMatrix;
  readonly effects: EffectCatalog;
  /** Fluxo dedicado. R-047: acrescentar um dado no substrato não move o do Validador. */
  readonly rng: Rng;
  readonly tuning: SubstrateTuning;
}

export interface TickContext {
  readonly simTime: number;
  readonly world: WorldView;
}

export interface TickReport {
  readonly evaluated: number;
  readonly effectsApplied: number;
  readonly deactivated: number;
  readonly cascadeStopped: boolean;
}

export class Substrate {
  readonly #o: SubstrateOptions;
  readonly #active = new Map<string, ReactiveTarget>();
  readonly causalLog: CausalEntry[] = [];

  constructor(options: SubstrateOptions) {
    this.#o = options;
  }

  /**
   * Entra no conjunto ativo. X-013, R-049.
   *
   * O conjunto é mantido por evento, e nunca por varredura. É a decisão barata
   * que resolve o problema de desempenho por inteiro: um mapa 512×512 de células
   * inertes custa tempo de tick zero porque o tick nunca souber o tamanho do
   * mapa — ele só conhece quem se mexeu.
   */
  activate(target: ReactiveTarget): void {
    this.#active.set(target.id, target);
  }

  deactivate(id: string): void {
    this.#active.delete(id);
  }

  activeCount(): number {
    return this.#active.size;
  }

  isActive(id: string): boolean {
    return this.#active.has(id);
  }

  /**
   * Quem ainda tem o que dizer.
   *
   * Um alvo sai do conjunto quando não tem estado transiente nenhum **e** sua
   * temperatura reconvergiu com o ambiente. A segunda metade é R-008: tile em
   * equilíbrio não guarda temperatura própria, não entra no laço térmico e lê
   * como ambiente. Sem ela, um tile que já esfriou continuaria sendo visitado
   * para sempre por ter sido aquecido uma vez.
   */
  #stillActive(t: ReactiveTarget, ambient: number): boolean {
    if (t.states.some((s) => s.intensity > 0)) return true;
    if (t.temperature === undefined) return false;
    return Math.abs(t.temperature - ambient) > this.#o.tuning.thermalEquilibriumTolerance;
  }

  tick(ctx: TickContext): TickReport {
    // Ordem por identificador, e não a de inserção do Map. A de inserção é
    // determinística em JavaScript, mas depende da sequência de eventos que
    // ativou cada alvo — o que faz a mesma cena, alcançada por caminhos
    // diferentes, consumir o fluxo semeado em ordem diferente e divergir
    // (R-047). Ordenar até 512 alvos custa nada e remove a fragilidade.
    const alvos = [...this.#active.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    let aplicados = 0;
    let cascataInterrompida = false;

    for (const alvo of alvos) {
      // Contínua: o elemento que o alvo carrega age sobre o próprio alvo.
      aplicados += this.#evaluate(alvo, alvo, 'continuous', ctx, undefined);

      // Vizinhança: uma passada por alvo por tick, sobre a fotografia do
      // conjunto ativo no início do tick. Deixar a propagação encadear dentro
      // do mesmo tick faria o fogo atravessar o mapa inteiro num tick, e a
      // cadência espacial de R-016 deixaria de existir.
      for (const vizinho of ctx.world.neighborsOf(alvo)) {
        aplicados += this.#evaluate(alvo, vizinho, 'neighborhood', ctx, undefined);
      }
    }

    aplicados += this.#thermalPass(alvos, ctx);
    this.#decayPass(alvos);
    this.#burnConsumePass(alvos, ctx);

    let desativados = 0;
    for (const alvo of alvos) {
      if (!this.#stillActive(alvo, ctx.world.ambientTemperature(alvo))) {
        this.#active.delete(alvo.id);
        desativados++;
      }
    }

    if (this.#active.size > this.#o.tuning.maxActiveTargets) {
      cascataInterrompida = true;
    }

    return {
      evaluated: alvos.length,
      effectsApplied: aplicados,
      deactivated: desativados,
      cascadeStopped: cascataInterrompida,
    };
  }

  /**
   * Contato. R-013.
   *
   * É a ocasião que garante que ações físicas óbvias não precisem do Validador:
   * encostar, derrubar, arremessar, empurrar contra e mergulhar são caminhos
   * causais modelados, e nenhum deles consulta modelo.
   */
  contact(
    actor: ReactiveTarget,
    receiver: ReactiveTarget,
    ctx: TickContext,
    eventTags?: ReadonlySet<string>,
  ): number {
    return this.#evaluate(actor, receiver, 'contact', ctx, eventTags);
  }

  entry(creature: ReactiveTarget, tile: ReactiveTarget, ctx: TickContext): number {
    return this.#evaluate(tile, creature, 'entry', ctx);
  }

  immersion(item: ReactiveTarget, medium: ReactiveTarget, ctx: TickContext): number {
    return this.#evaluate(medium, item, 'immersion', ctx);
  }

  /**
   * Invocação de efeito pelo Validador. R-043.
   *
   * Passa exatamente pelo mesmo caminho que a matriz usa, e é isso que o aceite
   * de R-043 exige: `engine_effect` com `ignite` produz comportamento
   * subsequente idêntico ao de uma ignição disparada pela matriz. O Validador é
   * a fonte de causação **nova** — ele acende, e quem propaga, consome e apaga é
   * a matriz.
   */
  invoke(
    effect: string,
    target: ReactiveTarget,
    ctx: TickContext,
    opts: { intensity?: number; materialId?: string; rationale?: string } = {},
  ): boolean {
    if (!isEffectId(effect)) {
      throw new Error(
        `Validador invocou "${effect}", fora do vocabulário fechado de R-015. ` +
          `A engine só sabe fazer o que está no vocabulário.`,
      );
    }
    return this.#applyEffect(effect, target, ctx, {
      kind: 'validator',
      ...(opts.rationale ? { ref: opts.rationale } : {}),
      ...(opts.intensity !== undefined ? { intensity: opts.intensity } : {}),
      ...(opts.materialId ? { materialId: opts.materialId } : {}),
    });
  }

  /**
   * Já existe caminho causal modelado para este efeito sobre este alvo? R-044.
   *
   * O Validador consulta antes de invocar. Invocar sobre algo que a matriz já
   * resolveria aplica o efeito duas vezes — e o sintoma disso não é erro, é uma
   * cortina que pega fogo com o dobro da intensidade e ninguém sabe por quê.
   */
  alreadyModelled(
    actor: ReactiveTarget,
    receiver: ReactiveTarget,
    effect: string,
    occasions: readonly Occasion[] = ['contact', 'neighborhood', 'continuous'],
  ): ReactionRule | undefined {
    for (const occasion of occasions) {
      const regra = this.#o.matrix
        .match(actor, receiver, occasion, this.#o.materials)
        .find((r) => r.effect === effect);
      if (regra) return regra;
    }
    return undefined;
  }

  #evaluate(
    actor: ReactiveTarget,
    receiver: ReactiveTarget,
    occasion: Occasion,
    ctx: TickContext,
    eventTags?: ReadonlySet<string>,
  ): number {
    const regras = this.#o.matrix.match(actor, receiver, occasion, this.#o.materials, eventTags);
    let aplicados = 0;

    for (const regra of regras) {
      const chance = this.#effectiveChance(regra, actor, receiver);
      // O dado é puxado mesmo quando a chance é 1. Puxar só quando há incerteza
      // faria o consumo do fluxo depender do estado do mundo, e duas execuções
      // que divergissem por um instante nunca mais se reencontrariam (R-047).
      if (!this.#o.rng.chance(chance)) continue;
      if (
        this.#applyEffect(regra.effect, receiver, ctx, {
          kind: 'matrix_rule',
          ref: regra.id,
          ...(actor.id !== receiver.id ? { actorId: actor.id } : {}),
        })
      ) {
        aplicados++;
      }
    }
    return aplicados;
  }

  /**
   * Chance efetiva depois dos modificadores. R-012.
   *
   * Modificador é aditivo sobre a chance base, e não multiplicativo. `wet: -0.8`
   * lido como multiplicador significaria "reduz para 20%", que ainda acende
   * madeira encharcada quase uma vez em cinco; lido como soma, ele leva 0,9 para
   * 0,1 e depois para perto de zero conforme a saturação sobe, que é o que a
   * prosa da regra descreve.
   */
  #effectiveChance(rule: ReactionRule, actor: ReactiveTarget, receiver: ReactiveTarget): number {
    let chance = rule.chance;
    for (const [nome, peso] of Object.entries(rule.modifiedBy ?? {})) {
      const escala = this.#modifierScale(nome, actor, receiver);
      if (escala !== undefined) chance += peso * escala;
    }
    return Math.max(0, Math.min(1, chance));
  }

  /**
   * O valor de 0 a 1 do modificador nomeado, ou indefinido se ele não se aplica.
   *
   * Um modificador que não se aplica é ignorado, e não tratado como zero. São a
   * mesma coisa aritmeticamente e não são a mesma coisa na depuração: ignorado
   * pode ser reportado como "esta regra citou `windToward` e não havia vento",
   * que é a diferença entre uma regra inerte e uma regra errada.
   */
  #modifierScale(nome: string, actor: ReactiveTarget, receiver: ReactiveTarget): number | undefined {
    const estado = receiver.states.find((s) => s.type === nome);
    if (estado) return estado.intensity / 100;

    const material = this.#o.materials.get(receiver.materialId);
    const numeric = (material.numeric ?? {}) as Record<string, number | undefined>;
    const valor = numeric[nome];
    if (valor !== undefined) return Math.max(0, Math.min(1, valor));

    const props = (material.properties ?? {}) as Record<string, boolean | undefined>;
    if (props[nome] === true) return 1;

    void actor;
    return undefined;
  }

  #applyEffect(
    effect: EffectId,
    target: ReactiveTarget,
    ctx: TickContext,
    cause: {
      kind: CausalEntry['cause']['kind'];
      ref?: string;
      actorId?: string;
      intensity?: number;
      materialId?: string;
    },
  ): boolean {
    const resultado = this.#o.effects.apply({
      effect,
      target,
      ...(cause.intensity !== undefined ? { intensity: cause.intensity } : {}),
      ...(cause.materialId ? { materialId: cause.materialId } : {}),
      ...(cause.actorId ? { sourceId: cause.actorId } : {}),
    });

    // Nada mudou, nada aconteceu. Registrar no log causal um efeito que não
    // mudou nada encheria a janela de retenção de X-017 com não-eventos, e
    // reativar o alvo o manteria no laço para sempre.
    if (!resultado.changed) return false;

    this.activate(target);
    this.#log(ctx.simTime, effect, target, cause);
    this.#cascade(target, ctx, 1);
    return true;
  }

  /**
   * Cascata dentro do tick. R-017.
   *
   * Efeito aplicado pode disparar reação de contato com quem divide a célula, e
   * é por aqui que a água derramada sobre piso condutivo com cabo energizado
   * eletrifica a poça inteira e fere quem estiver nela, sem que nenhuma regra
   * descreva esse cenário.
   *
   * O teto por tick não é otimização: `extinguish` gera `smoky`, e uma regra
   * mal escrita que fizesse `smoky` gerar `extinguish` prenderia o tick num
   * laço infinito. O teto transforma um travamento numa cadeia curta demais,
   * que é um defeito que aparece.
   */
  #cascade(origin: ReactiveTarget, ctx: TickContext, depth: number): void {
    if (depth > this.#o.tuning.maxCascadeStepsPerTick) return;
    for (const vizinho of ctx.world.occupantsOf(origin)) {
      if (vizinho.id === origin.id) continue;
      const regras = this.#o.matrix.match(origin, vizinho, 'contact', this.#o.materials);
      for (const regra of regras) {
        if (!this.#o.rng.chance(this.#effectiveChance(regra, origin, vizinho))) continue;
        const r = this.#o.effects.apply({ effect: regra.effect, target: vizinho });
        if (!r.changed) continue;
        this.activate(vizinho);
        this.#log(ctx.simTime, regra.effect, vizinho, {
          kind: 'matrix_rule',
          ref: regra.id,
          actorId: origin.id,
        });
        this.#cascade(vizinho, ctx, depth + 1);
      }
    }
  }

  /**
   * Convergência térmica e limiares. R-008, R-009.
   *
   * Só visita quem tem temperatura própria. Num mapa 512×512 sem nenhuma fonte
   * de calor o número de entidades visitadas é zero, que é o aceite de R-008 —
   * lidos ao pé da letra sem esta restrição, R-007 e R-008 mandariam convergir
   * 262 mil floats por tick por grid.
   */
  #thermalPass(alvos: readonly ReactiveTarget[], ctx: TickContext): number {
    let transicoes = 0;

    for (const alvo of alvos) {
      const material = this.#o.materials.get(alvo.materialId);
      if (material.thermal?.fixedTemperature !== undefined) {
        alvo.temperature = material.thermal.fixedTemperature;
      }

      // Limiar antes de convergir, e não depois. Um material de calor
      // específico baixo converge por inteiro num tick só, e conferir depois
      // significaria conferir a temperatura ambiente: gelo largado a quarenta
      // graus voltaria a vinte e nunca teria passado pelo ponto de fusão.
      if (alvo.temperature !== undefined && this.#crossThresholds(alvo, ctx)) transicoes++;

      if (material.thermal?.fixedTemperature === undefined && alvo.temperature !== undefined) {
        const ambiente = ctx.world.ambientTemperature(alvo);
        const calorEspecifico = material.numeric.specificHeat ?? 1;
        alvo.temperature += (ambiente - alvo.temperature) / calorEspecifico;
        if (Math.abs(alvo.temperature - ambiente) <= this.#o.tuning.thermalEquilibriumTolerance) {
          // Volta a ser o ambiente. É o que tira o alvo do laço térmico.
          delete alvo.temperature;
        }
      }
    }

    // Quem queima aquece a vizinhança. R-010.
    for (const alvo of alvos) {
      if (!hasState(alvo, 'burning')) continue;
      const intensidade = alvo.states.find((s) => s.type === 'burning')!.intensity;
      for (const vizinho of ctx.world.neighborsOf(alvo)) {
        const ambiente = ctx.world.ambientTemperature(vizinho);
        vizinho.temperature = (vizinho.temperature ?? ambiente) + intensidade / 10;
        this.activate(vizinho);
      }
    }

    return transicoes;
  }

  /**
   * Cruzar um limiar dispara a transição, sem regra na matriz. R-009.
   *
   * Gelo aquecido acima do ponto de fusão vira água sem que exista reação
   * ligando fogo a gelo: é aritmética, e escrever isso como regra seria escrever
   * uma linha por par de material e elemento.
   */
  #crossThresholds(target: ReactiveTarget, ctx: TickContext): boolean {
    const t = target.temperature!;
    const limiares = this.#o.materials.get(target.materialId).thermal;
    if (!limiares) return false;

    if (limiares.ignitePoint !== undefined && t >= limiares.ignitePoint && !hasState(target, 'burning')) {
      return this.#applyEffect('ignite', target, ctx, { kind: 'time', ref: 'ignitePoint' });
    }
    if (limiares.meltPoint !== undefined && t >= limiares.meltPoint && hasState(target, 'frozen')) {
      return this.#applyEffect('melt', target, ctx, { kind: 'time', ref: 'meltPoint' });
    }
    if (limiares.freezePoint !== undefined && t <= limiares.freezePoint && !hasState(target, 'frozen')) {
      return this.#applyEffect('freeze', target, ctx, { kind: 'time', ref: 'freezePoint' });
    }
    return false;
  }

  #decayPass(alvos: readonly ReactiveTarget[]): void {
    const decaimento = this.#o.tuning.stateDecayPerTick * 100;
    for (const alvo of alvos) {
      for (const estado of alvo.states) {
        if (estado.remainingTicks !== undefined) {
          estado.remainingTicks = Math.max(0, estado.remainingTicks - 1);
          if (estado.remainingTicks === 0) estado.intensity = 0;
        } else {
          estado.intensity = Math.max(0, estado.intensity - decaimento);
        }
      }
      alvo.states = alvo.states.filter((s) => s.intensity > 0);
    }
  }

  /**
   * Fogo consome combustível. R-027.
   *
   * Integridade zero → `burnsTo` (se estava em chama) ou `rubbleMaterialId`.
   * Sem isto o aceite "queima até virar escombro" não fecha.
   */
  #burnConsumePass(alvos: readonly ReactiveTarget[], ctx: TickContext): void {
    const perda = this.#o.tuning.burnIntegrityLossPerTick;
    for (const alvo of alvos) {
      if (!hasState(alvo, 'burning')) continue;
      if (alvo.integrity === undefined) alvo.integrity = 100;
      const antes = alvo.integrity;
      alvo.integrity = Math.max(0, alvo.integrity - perda);
      if (alvo.integrity !== antes) {
        this.#log(ctx.simTime, 'burn_consume', alvo, { kind: 'time', ref: 'burning' });
      }
      if (alvo.integrity > 0) continue;

      const material = this.#o.materials.get(alvo.materialId);
      const residuo = material.burnsTo ?? material.rubbleMaterialId;
      if (residuo && residuo !== alvo.materialId && this.#o.materials.has(residuo)) {
        const de = alvo.materialId;
        alvo.materialId = residuo;
        this.#log(ctx.simTime, 'transmute', alvo, { kind: 'time', ref: `burnsTo:${de}` });
      }
      // Chama morre no residuo; sobra fumaça breve.
      alvo.states = alvo.states.filter((s) => s.type !== 'burning');
      if (!alvo.states.some((s) => s.type === 'smoky')) {
        alvo.states.push({ type: 'smoky', intensity: 40 });
      }
    }
  }

  /**
   * Log causal. R-048, X-005.
   *
   * Sem isto, uma cadeia de seis passos é indistinguível de um bug. É a memória
   * do mundo, é determinística e é grátis por tick — a janela de retenção que a
   * mantém grátis por mês está em X-017.
   */
  #log(
    simTime: number,
    effect: string,
    target: ReactiveTarget,
    cause: { kind: CausalEntry['cause']['kind']; ref?: string; actorId?: string },
  ): void {
    this.causalLog.push({
      simTime,
      cause: {
        kind: cause.kind,
        ...(cause.ref ? { ref: cause.ref } : {}),
        ...(cause.actorId ? { actorId: cause.actorId } : {}),
      },
      effect,
      targetKind: target.kind,
      targetId: target.id,
      ...(target.gridId ? { gridId: target.gridId } : {}),
      ...(target.x !== undefined && target.y !== undefined ? { pos: { x: target.x, y: target.y } } : {}),
    });
  }
}
