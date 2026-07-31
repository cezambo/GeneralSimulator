import { BudgetExceeded, SchemaRepairFailed, type LlmRouter } from '../llm/index.js';
import type { SeedRoot } from '../rng/index.js';
import type {
  PlausibilityRegistry,
  ProvisionalRule,
  ValidationPolicy,
  WorldMutation,
} from '../types/domain.js';
import {
  resolveConsequences,
  type ProposedConsequence,
  type ResolvedConsequence,
} from './consequences.js';
import {
  resolveGeneralization,
  type GeneralizationOutcome,
  type GeneralizationProposal,
} from './generalization.js';
import {
  describesChangeWithoutMutating,
  screenMutations,
  type MutationRejection,
} from './mutations.js';

export * from './consequences.js';
export * from './generalization.js';
export * from './mutations.js';
export * from './derived.js';

/**
 * O laço do Validador. SPEC-V.
 *
 * O documento se define por subtração: quanto mais a engine resolve sozinha,
 * menos o Validador é chamado, e cada regra que ele promove é uma chamada que
 * deixa de existir para sempre. Um validador bem projetado fica progressivamente
 * mais barato ao longo de uma partida.
 *
 * Por isso o laço é, antes de tudo, uma sequência de portões que tentam **não**
 * chamar o modelo. A chamada é o último recurso, não o primeiro passo.
 */

export type Verdict = 'executed' | 'partial' | 'reinterpreted' | 'denied';

export type GatekeeperDomain =
  | 'physicalLaw'
  | 'inviolableLaw'
  | 'userProhibition'
  | 'bodyIntegrity'
  | 'socialNorm'
  | 'resourceConservation';

export interface MediationRequest {
  readonly agentId: string;
  readonly actionId: string;
  readonly actionType: string;
  /** A intenção em linguagem natural, como o pensamento a produziu. */
  readonly intent: string;
  readonly targetId?: string;
  readonly simTime: number;
  readonly simDay?: number;
  /** Tentativas anteriores nesta mesma intenção, em domínio de porteiro. V-036. */
  readonly priorAttempts?: readonly PriorAttempt[];
}

export interface PriorAttempt {
  readonly intent: string;
  readonly deniedDomain: GatekeeperDomain;
  readonly agentFeedback: string;
}

/**
 * O índice de affordances. V-002.
 *
 * Chamar um modelo para autorizar sentar numa cadeira seria a chamada de maior
 * volume e menor retorno do sistema inteiro.
 */
export interface AffordanceIndex {
  offers(targetId: string, actionType: string): boolean;
  /** A-010 já validou a proximidade? */
  withinReach(agentId: string, targetId: string): boolean;
  /** Retorno diegético por template, sem modelo. V-006. */
  feedbackFor(actionType: string, targetId: string): string;
  /** Mutações determinísticas daquela affordance. */
  mutationsFor(agentId: string, actionType: string, targetId: string): readonly WorldMutation[];
}

/**
 * As regras que o próprio Validador promoveu. V-024, V-026, V-041.
 *
 * Entrar viva na hora é o ponto: uma fila de aprovação humana antes da ativação
 * devolveria o custo que o mecanismo existe para eliminar.
 */
export interface ProvisionalRuleStore {
  /** A regra que responde por esta intenção, se alguma. */
  find(request: MediationRequest): ProvisionalRule | undefined;
  apply(rule: ProvisionalRule, request: MediationRequest): DeterministicOutcome;
  add(rule: ProvisionalRule): void;
  liveCount(): number;
  nextId(): string;
}

export interface DeterministicOutcome {
  readonly verdict: Verdict;
  readonly agentFeedback: string;
  readonly mutations: readonly WorldMutation[];
}

export interface ValidatorResponse {
  readonly verdict: Verdict;
  readonly narrative: string;
  readonly reasoning?: string;
  readonly deniedDomain?: GatekeeperDomain;
  readonly worldMutations: readonly WorldMutation[];
  readonly consequences?: readonly ProposedConsequence[];
  readonly agentFeedback: string;
  readonly generalization: GeneralizationProposal;
  readonly isMarcanteCandidate?: boolean;
  readonly witnessIds?: readonly string[];
}

/** Trilha de auditoria. V-029. */
export interface AuditEntry {
  readonly judgmentId: string;
  readonly agentId: string;
  readonly simTime: number;
  readonly intent: string;
  readonly path: MediationPath;
  readonly reasoning?: string;
  readonly raw?: string;
  readonly appliedMutations: readonly WorldMutation[];
  readonly rejectedMutations: readonly MutationRejection[];
  readonly rolls: readonly ResolvedConsequence[];
  readonly rollSeed?: string;
  readonly generalization?: GeneralizationOutcome;
  readonly notes: readonly string[];
}

export type MediationPath = 'affordance' | 'provisional_rule' | 'degraded' | 'validator';

export interface MediationResult {
  readonly path: MediationPath;
  readonly verdict: Verdict;
  /** O que chega ao agente. Sensorial, diegético, nunca linguagem de sistema. V-006. */
  readonly agentFeedback: string;
  readonly narrative?: string;
  readonly appliedMutations: readonly WorldMutation[];
  readonly isMarcanteCandidate: boolean;
  readonly witnessIds: readonly string[];
  /** Presente só quando a negação foi em domínio de porteiro e ainda há tentativa. V-036. */
  readonly retry?: {
    readonly deniedDomain: GatekeeperDomain;
    readonly attemptsRemaining: number;
    readonly agentFeedback: string;
  };
  readonly audit: AuditEntry;
}

export interface ValidatorOptions {
  readonly router: LlmRouter;
  readonly seedRoot: SeedRoot;
  readonly policy: ValidationPolicy;
  readonly plausibility: PlausibilityRegistry;
  readonly rules: ProvisionalRuleStore;
  readonly affordances?: AffordanceIndex;
  readonly alreadyModelled?: (m: WorldMutation) => string | undefined;
  readonly bodyOperations?: ReadonlySet<string>;
  readonly formulaTemplates?: ReadonlyMap<string, readonly string[]>;
  /** Teto de regras provisórias vivas. V-027. */
  readonly maxLiveRules?: number;
  /** Retorno diegético quando o orçamento acabou ou a resposta não veio. V-031, V-032. */
  readonly degradedFeedback?: (request: MediationRequest) => string;
}

const PROMPT_ID = 'gm.evaluate_high';

export class Validator {
  readonly #o: ValidatorOptions;
  readonly audit: AuditEntry[] = [];
  /** Dívida de matriz: método invocado que ainda não virou regra. V-028. */
  readonly #debt = new Map<string, number>();
  #judgments = 0;

  constructor(options: ValidatorOptions) {
    this.#o = options;
  }

  /**
   * Métodos mais invocados que ainda não viraram regra. V-028.
   *
   * É o único item de observabilidade do projeto que se paga em dinheiro:
   * invocação recorrente do mesmo método é sinal de que falta regra
   * determinística, e cada uma que falta é uma chamada por ocorrência, para
   * sempre.
   */
  debtRanking(): { method: string; invocations: number }[] {
    return [...this.#debt.entries()]
      .map(([method, invocations]) => ({ method, invocations }))
      .sort((a, b) => b.invocations - a.invocations || (a.method < b.method ? -1 : 1));
  }

  async mediate(
    request: MediationRequest,
    promptVariables: Readonly<Record<string, unknown>>,
  ): Promise<MediationResult> {
    const affordance = this.#tryAffordance(request);
    if (affordance) return affordance;

    const porRegra = this.#tryProvisionalRule(request);
    if (porRegra) return porRegra;

    return this.#invoke(request, promptVariables);
  }

  /**
   * Portão um: a ação casa com uma affordance declarada? V-002.
   *
   * Sentar, pegar item visível, abrir porta destrancada, comer e largar item
   * geram zero invocação. O Validador só entra quando a intenção não encontra
   * affordance — que é exatamente o caso interessante.
   */
  #tryAffordance(request: MediationRequest): MediationResult | undefined {
    const idx = this.#o.affordances;
    if (!idx || !request.targetId) return undefined;
    if (!idx.offers(request.targetId, request.actionType)) return undefined;
    if (!idx.withinReach(request.agentId, request.targetId)) return undefined;

    const mutacoes = idx.mutationsFor(request.agentId, request.actionType, request.targetId);
    return this.#finish(request, 'affordance', {
      verdict: 'executed',
      agentFeedback: idx.feedbackFor(request.actionType, request.targetId),
      appliedMutations: mutacoes,
      rejectedMutations: [],
      rolls: [],
      notes: [],
    });
  }

  /**
   * Portão dois: alguma regra que este Validador já promoveu responde por isto?
   * V-024, V-026, V-041.
   *
   * Este portão é a economia inteira do mecanismo de promoção. Sem ele, o
   * Validador continuaria sendo chamado para o caso que ele mesmo acabou de
   * resolver — e a regra provisória seria uma anotação sem efeito.
   */
  #tryProvisionalRule(request: MediationRequest): MediationResult | undefined {
    const regra = this.#o.rules.find(request);
    if (!regra || regra.state === 'rejected') return undefined;

    const resultado = this.#o.rules.apply(regra, request);
    return this.#finish(request, 'provisional_rule', {
      verdict: resultado.verdict,
      agentFeedback: resultado.agentFeedback,
      appliedMutations: resultado.mutations,
      rejectedMutations: [],
      rolls: [],
      notes: [`resolvido pela regra provisória "${regra.id}" (${regra.domain})`],
    });
  }

  async #invoke(
    request: MediationRequest,
    promptVariables: Readonly<Record<string, unknown>>,
  ): Promise<MediationResult> {
    const judgmentId = `judgment-${++this.#judgments}`;
    this.#recordDebt(request);

    let resposta: ValidatorResponse;
    let raw = '';
    try {
      const chamada = await this.#o.router.call<ValidatorResponse>(
        PROMPT_ID,
        { ...promptVariables, ...this.#retryVariables(request) },
        { agentId: request.agentId, simDay: request.simDay ?? 0 },
      );
      resposta = chamada.value;
      raw = chamada.trace.raw;
    } catch (erro) {
      // Orçamento estourado e reparo esgotado desembocam no mesmo lugar por
      // motivos diferentes, e nos dois o agente recebe retorno diegético em vez
      // de silêncio ou de linguagem de sistema. V-031, V-032.
      if (erro instanceof BudgetExceeded || erro instanceof SchemaRepairFailed) {
        return this.#degrade(request, judgmentId, erro);
      }
      throw erro;
    }

    if (
      describesChangeWithoutMutating(
        resposta.verdict,
        resposta.worldMutations,
        resposta.consequences,
      )
    ) {
      return this.#degrade(
        request,
        judgmentId,
        new Error('veredito executed sem mutação nem consequência: narrativa que não altera nada (V-005)'),
        raw,
      );
    }

    const notas: string[] = [];

    const triagem = screenMutations(resposta.worldMutations, {
      plausibility: this.#o.plausibility,
      ...(this.#o.alreadyModelled ? { alreadyModelled: this.#o.alreadyModelled } : {}),
      ...(this.#o.bodyOperations ? { bodyOperations: this.#o.bodyOperations } : {}),
    });

    const rolagem = resolveConsequences(resposta.consequences ?? [], this.#o.seedRoot, {
      simTime: request.simTime,
      agentId: request.agentId,
      actionId: request.actionId,
    });
    notas.push(...rolagem.rejections);

    // As mutações sorteadas passam pela mesma triagem das certas. Um desfecho
    // improvável não é um desfecho menos sujeito às regras: seria a porta de
    // entrada mais fácil para escrever num campo derivado ou invocar operação
    // que o cenário não permite.
    const triagemSorteadas = screenMutations(rolagem.mutations, {
      plausibility: this.#o.plausibility,
      ...(this.#o.alreadyModelled ? { alreadyModelled: this.#o.alreadyModelled } : {}),
      ...(this.#o.bodyOperations ? { bodyOperations: this.#o.bodyOperations } : {}),
    });

    const generalizacao = resolveGeneralization(resposta.generalization, {
      simTime: request.simTime,
      judgmentId,
      nextRuleId: () => this.#o.rules.nextId(),
      liveRuleCount: this.#o.rules.liveCount(),
      maxLiveRules: this.#o.maxLiveRules ?? 24,
      ...(this.#o.formulaTemplates ? { formulaTemplates: this.#o.formulaTemplates } : {}),
      ...(this.#o.bodyOperations ? { bodyOperations: this.#o.bodyOperations } : {}),
    });

    if (generalizacao.rule) {
      this.#o.rules.add(generalizacao.rule);
      // Sai da dívida no instante em que vira regra: continuar contando faria o
      // painel de V-028 apontar como dívida justamente o que foi quitado.
      this.#debt.delete(methodKey(request));
      notas.push(`promoveu a regra provisória "${generalizacao.rule.id}" em ${generalizacao.rule.domain}`);
    } else if (generalizacao.demotionReason) {
      notas.push(`generalização caiu para caso único: ${generalizacao.demotionReason}`);
    }

    return this.#finish(
      request,
      'validator',
      {
        verdict: resposta.verdict,
        agentFeedback: resposta.agentFeedback,
        appliedMutations: [...triagem.accepted, ...triagemSorteadas.accepted],
        rejectedMutations: [...triagem.rejected, ...triagemSorteadas.rejected],
        rolls: rolagem.outcomes,
        notes: notas,
        ...(resposta.narrative ? { narrative: resposta.narrative } : {}),
        ...(resposta.reasoning ? { reasoning: resposta.reasoning } : {}),
        ...(resposta.isMarcanteCandidate ? { isMarcanteCandidate: true } : {}),
        ...(resposta.witnessIds ? { witnessIds: resposta.witnessIds } : {}),
        rollSeed: rolagem.rollSeed,
        generalization: generalizacao,
        raw,
      },
      this.#retryFor(request, resposta),
      judgmentId,
    );
  }

  /**
   * Nova tentativa, e a assimetria que a mantém pagável. V-036.
   *
   * Dentro de domínio de porteiro, o agente recebe a explicação diegética e
   * decide de novo com o motivo no contexto. **Fora deles não há nova
   * tentativa**: a negação é final e diegética.
   *
   * A assimetria não é economia mesquinha. Negação fora de porteiro é o caso
   * comum, e conceder retentativa nele significaria pagar duas ou três chamadas
   * toda vez que o mundo disser não a alguma coisa — que é o que o mundo faz o
   * tempo todo.
   */
  #retryFor(
    request: MediationRequest,
    resposta: ValidatorResponse,
  ): MediationResult['retry'] | undefined {
    if (resposta.verdict !== 'denied' || !resposta.deniedDomain) return undefined;
    if (!this.#o.policy.gatekeeperDomains.includes(resposta.deniedDomain)) return undefined;

    const teto = Math.min(this.#o.policy.maxRetries ?? 0, 3);
    const jaFeitas = request.priorAttempts?.length ?? 0;
    const restantes = teto - jaFeitas;
    if (restantes <= 0) return undefined;

    return {
      deniedDomain: resposta.deniedDomain,
      attemptsRemaining: restantes,
      agentFeedback: resposta.agentFeedback,
    };
  }

  /**
   * A tentativa anterior, em prosa e não em objeto.
   *
   * Vai sempre, vazia inclusive: o renderizador exige que toda variável
   * declarada seja fornecida, e uma variável que só aparece às vezes seria uma
   * variável que quebra o prompt justamente no caminho menos exercitado.
   */
  #retryVariables(request: MediationRequest): Record<string, unknown> {
    const anteriores = request.priorAttempts ?? [];
    if (anteriores.length === 0) return { priorAttempts: '' };

    const linhas = anteriores.map(
      (a, i) => `${i + 1}. Tentou: "${a.intent}". Não deu, por ${a.deniedDomain}. Sentiu: ${a.agentFeedback}`,
    );
    return {
      priorAttempts: ['### Tentativas anteriores nesta mesma intenção', ...linhas].join('\n'),
    };
  }

  #degrade(
    request: MediationRequest,
    judgmentId: string,
    causa: Error,
    raw = '',
  ): MediationResult {
    const feedback =
      this.#o.degradedFeedback?.(request) ??
      'A tentativa não vai adiante, e o momento passa sem que nada mude.';
    return this.#finish(
      request,
      'degraded',
      {
        verdict: 'denied',
        agentFeedback: feedback,
        appliedMutations: [],
        rejectedMutations: [],
        rolls: [],
        notes: [`caminho degradado: ${causa.message}`],
        ...(raw ? { raw } : {}),
      },
      undefined,
      judgmentId,
    );
  }

  #recordDebt(request: MediationRequest): void {
    const chave = methodKey(request);
    this.#debt.set(chave, (this.#debt.get(chave) ?? 0) + 1);
  }

  #finish(
    request: MediationRequest,
    path: MediationPath,
    parts: {
      verdict: Verdict;
      agentFeedback: string;
      appliedMutations: readonly WorldMutation[];
      rejectedMutations: readonly MutationRejection[];
      rolls: readonly ResolvedConsequence[];
      notes: readonly string[];
      narrative?: string;
      reasoning?: string;
      rollSeed?: string;
      generalization?: GeneralizationOutcome;
      isMarcanteCandidate?: boolean;
      witnessIds?: readonly string[];
      raw?: string;
    },
    retry?: MediationResult['retry'],
    judgmentId = `judgment-${++this.#judgments}`,
  ): MediationResult {
    const entrada: AuditEntry = {
      judgmentId,
      agentId: request.agentId,
      simTime: request.simTime,
      intent: request.intent,
      path,
      appliedMutations: parts.appliedMutations,
      rejectedMutations: parts.rejectedMutations,
      rolls: parts.rolls,
      notes: parts.notes,
      ...(parts.reasoning ? { reasoning: parts.reasoning } : {}),
      ...(parts.raw ? { raw: parts.raw } : {}),
      ...(parts.rollSeed ? { rollSeed: parts.rollSeed } : {}),
      ...(parts.generalization ? { generalization: parts.generalization } : {}),
    };
    this.audit.push(entrada);

    return {
      path,
      verdict: parts.verdict,
      agentFeedback: parts.agentFeedback,
      appliedMutations: parts.appliedMutations,
      isMarcanteCandidate: parts.isMarcanteCandidate ?? false,
      witnessIds: parts.witnessIds ?? [],
      audit: entrada,
      ...(parts.narrative ? { narrative: parts.narrative } : {}),
      ...(retry ? { retry } : {}),
    };
  }
}

/**
 * A chave que identifica "o mesmo método". V-028.
 *
 * Tipo de ação mais tipo de alvo, e não a intenção em prosa: a prosa muda de
 * palavra a cada agente e nunca se repetiria, o que faria a lista de dívida
 * ficar permanentemente vazia enquanto o mesmo improviso é rejulgado toda vez.
 */
function methodKey(request: MediationRequest): string {
  return `${request.actionType}::${request.targetId ?? '-'}`;
}
