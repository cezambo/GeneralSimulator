import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LlmRouter } from '../llm/index.js';
import { SeedRoot } from '../rng/index.js';
import type {
  PlausibilityRegistry,
  ProvisionalRule,
  ValidationPolicy,
  WorldMutation,
} from '../types/domain.js';
import {
  Validator,
  resolveConsequences,
  resolveGeneralization,
  screenMutations,
  findDerivedWrites,
  derivedFieldNames,
  rollStreamName,
  type AffordanceIndex,
  type MediationRequest,
  type ProvisionalRuleStore,
  type ValidatorResponse,
} from './index.js';

const PLAUSIBILITY: PlausibilityRegistry = {
  allowedOperations: ['ignite', 'wet', 'electrify', 'apply_condition', 'damage_part'],
  forbiddenOperations: [],
  inviolableLaws: ['ninguém voa'],
};

const POLICY: ValidationPolicy = { gatekeeperDomains: ['physicalLaw'], maxRetries: 2 };

const VARIAVEIS = {
  intent: 'esfrega gravetos com força',
  agentSnapshot: 'Ana, mãos livres',
  targetSnapshot: 'gravetos secos',
  worldSnapshot: 'clareira',
  userInstructions: 'nenhuma',
  substrateSnapshot: 'gravetos: madeira, inflamável',
  matrixSummary: 'chama encostando em inflamável acende',
  bodySnapshot: 'Ana ilesa',
  injurySummary: 'faca corta',
  allowedOperations: 'ignite, wet',
  plausibilityRegistry: 'mundo realista',
};

function pedido(over: Partial<MediationRequest> = {}): MediationRequest {
  return {
    agentId: 'ana',
    actionId: 'act-1',
    actionType: 'rub_sticks',
    intent: 'esfrega gravetos com força',
    targetId: 'gravetos-1',
    simTime: 100,
    simDay: 1,
    ...over,
  };
}

/** Store em memória, que é tudo que o laço precisa saber sobre regras. */
class FakeRules implements ProvisionalRuleStore {
  rules: ProvisionalRule[] = [];
  matcher: (r: MediationRequest) => ProvisionalRule | undefined = () => undefined;
  applied: ProvisionalRule[] = [];
  #n = 0;
  find(r: MediationRequest) {
    return this.matcher(r);
  }
  apply(rule: ProvisionalRule) {
    this.applied.push(rule);
    return { verdict: 'executed' as const, agentFeedback: 'a fricção esquenta', mutations: [] };
  }
  add(rule: ProvisionalRule) {
    this.rules.push(rule);
  }
  liveCount() {
    return this.rules.filter((r) => r.state === 'provisional').length;
  }
  nextId() {
    return `rule-${++this.#n}`;
  }
}

/**
 * Provedor que devolve a resposta que o teste mandar, sem rede.
 *
 * Cada teste recebe um diretório de cassete próprio. Compartilhar um faria a
 * chave — prompt, variáveis e binding — coincidir entre testes que só diferem
 * na resposta encenada, e todos receberiam a gravação do primeiro.
 */
function routerRespondendo(resposta: ValidatorResponse): LlmRouter {
  return new LlmRouter({
    mode: 'hybrid',
    cassetteDir: mkdtempSync(join(tmpdir(), 'cass-val-')),
    providerFactory: () => ({
      async chat() {
        return {
          raw: JSON.stringify(resposta),
          promptTokens: 10,
          completionTokens: 10,
          costUsd: 0,
          latencyMs: 1,
        };
      },
    }),
  });
}

function respostaBase(over: Partial<ValidatorResponse> = {}): ValidatorResponse {
  return {
    verdict: 'executed',
    narrative: 'A fricção produz uma brasa.',
    reasoning: 'Madeira seca, força suficiente, tempo suficiente.',
    // Um veredito `executed` sem mutação nenhuma é recusado por V-005, então a
    // resposta de base traz uma: encená-la vazia faria todo teste que só quer
    // um julgamento comum medir, sem querer, o guarda de narrativa sem mutação.
    worldMutations: [{ type: 'agent_state', target: 'ana', changes: { fatigue: 3 } }],
    agentFeedback: 'A fumaça sobe entre seus dedos.',
    generalization: { verdict: 'one_off', reasoning: 'caso isolado' },
    ...over,
  };
}

function validador(opts: {
  resposta?: ValidatorResponse;
  rules?: FakeRules;
  affordances?: AffordanceIndex;
  alreadyModelled?: (m: WorldMutation) => string | undefined;
  policy?: ValidationPolicy;
  maxLiveRules?: number;
}) {
  const rules = opts.rules ?? new FakeRules();
  const v = new Validator({
    router: routerRespondendo(opts.resposta ?? respostaBase()),
    seedRoot: new SeedRoot('partida'),
    policy: opts.policy ?? POLICY,
    plausibility: PLAUSIBILITY,
    rules,
    ...(opts.affordances ? { affordances: opts.affordances } : {}),
    ...(opts.alreadyModelled ? { alreadyModelled: opts.alreadyModelled } : {}),
    ...(opts.maxLiveRules !== undefined ? { maxLiveRules: opts.maxLiveRules } : {}),
  });
  return { v, rules };
}

const EFEITO_NOVO: WorldMutation = {
  type: 'engine_effect',
  target: 'gravetos-1',
  changes: {},
  effectId: 'ignite',
  rationale: 'Nenhuma regra liga atrito a fogo, e não há chama em lugar nenhum no escopo.',
};

// ── Portões que evitam a chamada ──────────────────────────────────────────

describe('affordance-first (V-002)', () => {
  const idx: AffordanceIndex = {
    offers: (t, a) => t === 'cadeira-1' && a === 'sit',
    withinReach: () => true,
    feedbackFor: () => 'Você se acomoda; a madeira range.',
    mutationsFor: () => [{ type: 'agent_state', target: 'ana', changes: { posture: 'sitting' } }],
  };

  it('sentar numa cadeira não invoca o Validador', async () => {
    const { v } = validador({ affordances: idx });
    const r = await v.mediate(pedido({ actionType: 'sit', targetId: 'cadeira-1' }), VARIAVEIS);
    expect(r.path).toBe('affordance');
    expect(r.verdict).toBe('executed');
    expect(r.appliedMutations).toHaveLength(1);
  });

  // A affordance existe mas o agente está longe: a proximidade e de A-010, e
  // sem ela o portao nao pode fechar sozinho.
  it('affordance fora de alcance cai para o Validador', async () => {
    const longe: AffordanceIndex = { ...idx, withinReach: () => false };
    const { v } = validador({ affordances: longe });
    const r = await v.mediate(pedido({ actionType: 'sit', targetId: 'cadeira-1' }), VARIAVEIS);
    expect(r.path).toBe('validator');
  });

  it('ação sem affordance declarada chega ao Validador', async () => {
    const { v } = validador({ affordances: idx });
    expect((await v.mediate(pedido(), VARIAVEIS)).path).toBe('validator');
  });

  it('o retorno da affordance é diegético e não menciona sistema', async () => {
    const { v } = validador({ affordances: idx });
    const r = await v.mediate(pedido({ actionType: 'sit', targetId: 'cadeira-1' }), VARIAVEIS);
    expect(r.agentFeedback).not.toMatch(/affordance|válid|erro|regra/i);
  });
});

describe('regra provisória resolve sem chamada (V-024, V-026)', () => {
  const REGRA: ProvisionalRule = {
    id: 'rule-1',
    domain: 'substrate',
    state: 'provisional',
    rule: { condition: { when: 'contact' }, effect: { effect: 'ignite', chance: 0.6 } },
    proposedAtSimTime: 10,
  };

  // O mesmo metodo improvisado, repetido logo em seguida, resolve pela regra
  // provisoria sem nova chamada. E a economia inteira do mecanismo.
  it('o método já promovido não volta ao modelo', async () => {
    const rules = new FakeRules();
    rules.matcher = () => REGRA;
    const { v } = validador({ rules });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.path).toBe('provisional_rule');
    expect(rules.applied).toHaveLength(1);
  });

  it('regra rejeitada não resolve mais nada, e o caso volta ao Validador', async () => {
    const rules = new FakeRules();
    rules.matcher = () => ({ ...REGRA, state: 'rejected' });
    const { v } = validador({ rules });
    expect((await v.mediate(pedido(), VARIAVEIS)).path).toBe('validator');
  });

  it('a affordance tem precedência sobre a regra provisória', async () => {
    const rules = new FakeRules();
    rules.matcher = () => REGRA;
    const idx: AffordanceIndex = {
      offers: () => true,
      withinReach: () => true,
      feedbackFor: () => 'pronto',
      mutationsFor: () => [],
    };
    const { v } = validador({ rules, affordances: idx });
    expect((await v.mediate(pedido(), VARIAVEIS)).path).toBe('affordance');
  });
});

// ── Guarda de mutação ─────────────────────────────────────────────────────

describe('campo derivado (V-013)', () => {
  // Os nomes vem do schema e nao de uma lista em codigo: duplicar a lista faria
  // dela uma segunda fonte de verdade que divergiria em silencio.
  it('o guarda lê as marcas do schema', () => {
    const nomes = derivedFieldNames();
    expect(nomes.has('isAlive')).toBe(true);
    expect(nomes.has('capacities')).toBe(true);
    expect(nomes.has('functioning')).toBe(true);
    expect(nomes.has('stage')).toBe(true);
    expect(nomes.has('severity')).toBe(false);
  });

  it('acha escrita derivada aninhada', () => {
    expect(findDerivedWrites({ biology: { isAlive: false } })).toEqual(['biology.isAlive']);
  });

  it('acha escrita derivada em caminho pontuado', () => {
    expect(findDerivedWrites({ 'biology.capacities.moving': 0 })).toHaveLength(1);
  });

  // Para matar alguem ele precisa destruir uma parte vital, entao morte
  // narrativa nasce com a mesma cadeia causal auditavel de qualquer outra.
  it('matar escrevendo isAlive é recusado, e a recusa diz o que escrever', () => {
    const m: WorldMutation = { type: 'agent_state', target: 'bruno', changes: { isAlive: false } };
    const { rejected, accepted } = screenMutations([m], { plausibility: PLAUSIBILITY });
    expect(accepted).toHaveLength(0);
    expect(rejected[0]?.requirement).toBe('V-013');
    expect(rejected[0]?.reason).toMatch(/condição|parte|substância/);
  });

  it('matar destruindo uma parte vital passa', () => {
    const m: WorldMutation = {
      type: 'agent_state',
      target: 'bruno',
      changes: { parts: { coracao: { destroyed: true } } },
    };
    expect(screenMutations([m], { plausibility: PLAUSIBILITY }).accepted).toHaveLength(1);
  });
});

describe('registro de plausibilidade e justificativa (V-016, V-020)', () => {
  it('operação fora do registro é rejeitada antes de tocar o estado', () => {
    const m: WorldMutation = { ...EFEITO_NOVO, effectId: 'transmute' };
    const { rejected } = screenMutations([m], { plausibility: PLAUSIBILITY });
    expect(rejected[0]?.requirement).toBe('V-016');
  });

  it('a lista de proibidos vence a de permitidos', () => {
    const registro: PlausibilityRegistry = { ...PLAUSIBILITY, forbiddenOperations: ['ignite'] };
    expect(screenMutations([EFEITO_NOVO], { plausibility: registro }).rejected).toHaveLength(1);
  });

  it('efeito fora do vocabulário nem chega ao registro', () => {
    const m: WorldMutation = { ...EFEITO_NOVO, effectId: 'teleportar' };
    expect(screenMutations([m], { plausibility: PLAUSIBILITY }).rejected[0]?.requirement).toBe('R-015');
  });

  it('engine_effect sem justificativa da lacuna é rejeitado', () => {
    const m: WorldMutation = { ...EFEITO_NOVO, rationale: 'porque sim' };
    expect(screenMutations([m], { plausibility: PLAUSIBILITY }).rejected[0]?.requirement).toBe('V-020');
  });

  // Invocar sobre algo que a matriz ja resolveria aplica o efeito duas vezes.
  it('efeito que a matriz já cobre é rejeitado, nomeando a regra', () => {
    const { rejected } = screenMutations([EFEITO_NOVO], {
      plausibility: PLAUSIBILITY,
      alreadyModelled: () => 'ignition-by-contact',
    });
    expect(rejected[0]?.requirement).toBe('R-044');
    expect(rejected[0]?.reason).toMatch(/ignition-by-contact/);
  });

  it('causação genuinamente nova passa', () => {
    expect(screenMutations([EFEITO_NOVO], { plausibility: PLAUSIBILITY }).accepted).toHaveLength(1);
  });

  it('uma mutação recusada não derruba as válidas ao lado', () => {
    const ruim: WorldMutation = { type: 'agent_state', target: 'x', changes: { isAlive: false } };
    const boa: WorldMutation = { type: 'inventory', target: 'ana', changes: { add: 'tocha' } };
    const r = screenMutations([ruim, boa], { plausibility: PLAUSIBILITY });
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });
});

// ── Consequência e rolagem ────────────────────────────────────────────────

describe('consequência probabilística (V-038, V-039)', () => {
  const seed = () => new SeedRoot('partida');
  const chave = { simTime: 100, agentId: 'ana', actionId: 'act-1' };

  it('a maior parte das ações não produz rolagem nenhuma', () => {
    const r = resolveConsequences([], seed(), chave);
    expect(r.outcomes).toHaveLength(0);
    expect(r.mutations).toHaveLength(0);
  });

  it('grupo exclusivo escolhe exatamente um', () => {
    const props = [
      { description: 'o galho aguenta', probability: 70, mutations: [], exclusiveGroup: 'galho' },
      { description: 'o galho quebra', probability: 30, mutations: [], exclusiveGroup: 'galho' },
    ];
    const ocorridos = resolveConsequences(props, seed(), chave).outcomes.filter((o) => o.occurred);
    expect(ocorridos).toHaveLength(1);
  });

  // Normalizar em silencio faria a estimativa errada do modelo virar
  // comportamento plausivel, e o defeito nunca apareceria.
  it('grupo que não soma cem é rejeitado inteiro, e não normalizado', () => {
    const props = [
      { description: 'a', probability: 70, mutations: [], exclusiveGroup: 'g' },
      { description: 'b', probability: 20, mutations: [], exclusiveGroup: 'g' },
    ];
    const r = resolveConsequences(props, seed(), chave);
    expect(r.outcomes.every((o) => !o.occurred)).toBe(true);
    expect(r.rejections[0]).toMatch(/soma 90/);
  });

  it('desfechos sem grupo são independentes', () => {
    const props = [
      { description: 'certo', probability: 100, mutations: [] },
      { description: 'impossível', probability: 1, mutations: [] },
    ];
    const r = resolveConsequences(props, seed(), chave);
    expect(r.outcomes.find((o) => o.description === 'certo')?.occurred).toBe(true);
  });

  // A rolagem precisa ser recalculavel a partir da mesma semente para que o
  // cassete reproduza a partida inteira, e nao so as respostas.
  it('mesma chave e mesma semente produzem a mesma rolagem', () => {
    const props = [
      { description: 'a', probability: 50, mutations: [], exclusiveGroup: 'g' },
      { description: 'b', probability: 50, mutations: [], exclusiveGroup: 'g' },
    ];
    const um = resolveConsequences(props, seed(), chave).outcomes.find((o) => o.occurred);
    const dois = resolveConsequences(props, seed(), chave).outcomes.find((o) => o.occurred);
    expect(um?.description).toBe(dois?.description);
  });

  it('ação diferente rola diferente', () => {
    expect(rollStreamName(chave)).not.toBe(rollStreamName({ ...chave, actionId: 'act-2' }));
  });

  // A ordem do array vem do modelo, e dois cassetes do mesmo julgamento podem
  // traze-la trocada sem que nada tenha mudado.
  it('reordenar os desfechos não muda quem ocorre', () => {
    const a = { description: 'aguenta', probability: 60, mutations: [], exclusiveGroup: 'g' };
    const b = { description: 'quebra', probability: 40, mutations: [], exclusiveGroup: 'g' };
    const um = resolveConsequences([a, b], seed(), chave).outcomes.find((o) => o.occurred);
    const dois = resolveConsequences([b, a], seed(), chave).outcomes.find((o) => o.occurred);
    expect(um?.description).toBe(dois?.description);
  });

  // Registrar um fluxo por rolagem deixaria o save crescer uma linha por
  // rolagem para sempre, e nao compraria nada.
  it('a rolagem não deixa fluxo registrado no save', () => {
    const raiz = seed();
    resolveConsequences([{ description: 'x', probability: 50, mutations: [] }], raiz, chave);
    expect(raiz.cursors()).toHaveLength(0);
  });
});

// ── Promoção ──────────────────────────────────────────────────────────────

describe('promoção generalizada (V-021, V-022, V-023)', () => {
  const base = {
    simTime: 10,
    judgmentId: 'j-1',
    nextRuleId: () => 'rule-1',
    liveRuleCount: 0,
    maxLiveRules: 24,
  };

  it('regra de substrato bem formada entra viva', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: { when: 'contact', in: ['#friction', '#inflammable'], effect: 'ignite', chance: 0.4 },
        reasoning: 'atrito prolongado acende madeira seca',
      },
      base,
    );
    expect(r.verdict).toBe('systemic');
    expect(r.rule?.state).toBe('provisional');
    expect(r.rule?.proposedAtSimTime).toBe(10);
  });

  // Nao existe caminho pelo qual uma regra malformada entre na matriz.
  it('efeito inventado cai para caso único em vez de dar erro', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: { when: 'contact', effect: 'teleportar', chance: 0.4 },
        reasoning: 'x',
      },
      base,
    );
    expect(r.verdict).toBe('one_off');
    expect(r.demotionReason).toMatch(/R-015/);
  });

  it('ocasião inventada também cai', () => {
    const r = resolveGeneralization(
      { verdict: 'systemic', domain: 'substrate', rule: { when: 'sempre', effect: 'ignite', chance: 1 }, reasoning: 'x' },
      base,
    );
    expect(r.demotionReason).toMatch(/R-013/);
  });

  it('regra de objeto sem defId cai', () => {
    const r = resolveGeneralization(
      { verdict: 'systemic', domain: 'object', rule: { trigger: 'use', effect: 'ignite' }, reasoning: 'x' },
      base,
    );
    expect(r.demotionReason).toMatch(/defId/);
  });

  it('regra de objeto completa passa', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'object',
        rule: { defId: 'pederneira', trigger: 'strike', outcome: 'faísca', effect: 'ignite' },
        reasoning: 'bater pederneira produz faísca',
      },
      base,
    );
    expect(r.verdict).toBe('systemic');
    expect(r.rule?.domain).toBe('object');
  });

  it('domínio desconhecido cai', () => {
    const r = resolveGeneralization(
      { verdict: 'systemic', domain: 'meteorologia', rule: { x: 1 }, reasoning: 'x' },
      base,
    );
    expect(r.demotionReason).toMatch(/domínio/);
  });

  // O teto vem antes da forma: uma regra bem formada alem do teto e exatamente
  // o caso que V-027 precisa conter.
  it('o teto de regras vivas barra antes de conferir a forma', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: { when: 'contact', effect: 'ignite', chance: 0.4 },
        reasoning: 'x',
      },
      { ...base, liveRuleCount: 24 },
    );
    expect(r.demotionReason).toMatch(/teto de 24/);
  });

  it('one_off proposto continua one_off, sem motivo de queda', () => {
    const r = resolveGeneralization({ verdict: 'one_off', reasoning: 'caso isolado' }, base);
    expect(r.verdict).toBe('one_off');
    expect(r.demotionReason).toBeUndefined();
  });
});

describe('molde de fórmula (V-040)', () => {
  const moldes = new Map([['impact_damage', ['mass', 'velocity', 'resistance']]]);
  const base = {
    simTime: 10,
    judgmentId: 'j-1',
    nextRuleId: () => 'rule-1',
    liveRuleCount: 0,
    maxLiveRules: 24,
    formulaTemplates: moldes,
  };

  it('molde válido com todos os parâmetros passa', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: {
          formula: {
            templateId: 'impact_damage',
            parameters: { mass: 2, velocity: 8, resistance: 3 },
            output: { kind: 'damage', damageType: 'blunt' },
          },
        },
        reasoning: 'massa vezes velocidade contra resistência',
      },
      base,
    );
    expect(r.verdict).toBe('systemic');
  });

  it('molde inexistente cai para caso único', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: { formula: { templateId: 'inventado', parameters: {}, output: { kind: 'damage' } } },
        reasoning: 'x',
      },
      base,
    );
    expect(r.demotionReason).toMatch(/inexistente/);
  });

  it('parâmetro não declarado pelo molde cai', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: {
          formula: {
            templateId: 'impact_damage',
            parameters: { mass: 2, velocity: 8, resistance: 3, humor: 1 },
            output: { kind: 'damage' },
          },
        },
        reasoning: 'x',
      },
      base,
    );
    expect(r.demotionReason).toMatch(/humor/);
  });

  it('parâmetro faltando cai', () => {
    const r = resolveGeneralization(
      {
        verdict: 'systemic',
        domain: 'substrate',
        rule: {
          formula: { templateId: 'impact_damage', parameters: { mass: 2 }, output: { kind: 'damage' } },
        },
        reasoning: 'x',
      },
      base,
    );
    expect(r.demotionReason).toMatch(/velocity/);
  });
});

// ── O laço completo ───────────────────────────────────────────────────────

describe('o laço (V-005, V-027, V-028, V-029, V-036)', () => {
  it('a promoção aceita entra viva no store no mesmo julgamento', async () => {
    const rules = new FakeRules();
    const { v } = validador({
      rules,
      resposta: respostaBase({
        worldMutations: [EFEITO_NOVO],
        generalization: {
          verdict: 'systemic',
          domain: 'substrate',
          rule: { when: 'contact', in: ['#friction', '#inflammable'], effect: 'ignite', chance: 0.4 },
          reasoning: 'atrito acende madeira seca',
        },
      }),
    });
    await v.mediate(pedido(), VARIAVEIS);
    expect(rules.rules).toHaveLength(1);
    expect(rules.rules[0]?.state).toBe('provisional');
  });

  it('veredito executed sem mutação nem consequência cai para o caminho degradado', async () => {
    const { v } = validador({ resposta: respostaBase({ worldMutations: [] }) });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.path).toBe('degraded');
    expect(r.audit.notes[0]).toMatch(/V-005/);
  });

  it('o retorno degradado é diegético', async () => {
    const { v } = validador({ resposta: respostaBase({ worldMutations: [] }) });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.agentFeedback).not.toMatch(/erro|schema|orçamento|V-\d/);
  });

  // A trilha guarda o que foi aplicado e o que foi recusado, e e o que torna a
  // duplicacao detectavel em auditoria em vez de invisivel.
  it('a trilha registra mutações aplicadas e recusadas lado a lado', async () => {
    const ruim: WorldMutation = { type: 'agent_state', target: 'bruno', changes: { isAlive: false } };
    const { v } = validador({ resposta: respostaBase({ worldMutations: [EFEITO_NOVO, ruim] }) });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.audit.appliedMutations).toHaveLength(1);
    expect(r.audit.rejectedMutations).toHaveLength(1);
    expect(r.appliedMutations).toHaveLength(1);
  });

  it('a trilha guarda o raciocínio, e ele não vaza para o agente', async () => {
    const { v } = validador({ resposta: respostaBase({ worldMutations: [EFEITO_NOVO] }) });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.audit.reasoning).toMatch(/Madeira seca/);
    expect(r.agentFeedback).not.toMatch(/Madeira seca/);
  });

  it('a semente da rolagem aparece na trilha', async () => {
    const { v } = validador({
      resposta: respostaBase({
        worldMutations: [EFEITO_NOVO],
        consequences: [{ description: 'a brasa pega', probability: 60, mutations: [] }],
      }),
    });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.audit.rollSeed).toBe('validador:roll:100:ana:act-1');
    expect(r.audit.rolls).toHaveLength(1);
  });

  // Um desfecho improvavel nao e um desfecho menos sujeito as regras.
  it('mutação sorteada passa pela mesma triagem da certa', async () => {
    const ruim: WorldMutation = { type: 'agent_state', target: 'b', changes: { capacities: { moving: 0 } } };
    const { v } = validador({
      resposta: respostaBase({
        worldMutations: [EFEITO_NOVO],
        consequences: [{ description: 'ele desaba', probability: 100, mutations: [ruim] }],
      }),
    });
    const r = await v.mediate(pedido(), VARIAVEIS);
    expect(r.audit.rejectedMutations.some((x) => x.requirement === 'V-013')).toBe(true);
  });

  it('negação em domínio de porteiro convida a tentar de novo', async () => {
    const { v } = validador({
      resposta: respostaBase({
        verdict: 'denied',
        deniedDomain: 'physicalLaw',
        worldMutations: [],
        agentFeedback: 'Seus pés não deixam o chão.',
      }),
    });
    const r = await v.mediate(pedido({ actionType: 'fly' }), VARIAVEIS);
    expect(r.retry?.attemptsRemaining).toBe(2);
    expect(r.retry?.deniedDomain).toBe('physicalLaw');
  });

  // A assimetria e o que mantem o mecanismo pagavel: negacao fora de porteiro e
  // o caso comum.
  it('negação fora de domínio de porteiro é final', async () => {
    const { v } = validador({
      resposta: respostaBase({
        verdict: 'denied',
        deniedDomain: 'socialNorm',
        worldMutations: [],
        agentFeedback: 'Ninguém ali aceitaria isso.',
      }),
    });
    expect((await v.mediate(pedido(), VARIAVEIS)).retry).toBeUndefined();
  });

  it('as tentativas se esgotam', async () => {
    const { v } = validador({
      resposta: respostaBase({
        verdict: 'denied',
        deniedDomain: 'physicalLaw',
        worldMutations: [],
        agentFeedback: 'Seus pés não deixam o chão.',
      }),
    });
    const anteriores = [
      { intent: 'voar', deniedDomain: 'physicalLaw' as const, agentFeedback: 'não sobe' },
      { intent: 'saltar alto', deniedDomain: 'physicalLaw' as const, agentFeedback: 'não sobe' },
    ];
    const r = await v.mediate(pedido({ priorAttempts: anteriores }), VARIAVEIS);
    expect(r.retry).toBeUndefined();
  });

  it('com lista de porteiros vazia nem a lei física convida a tentar de novo', async () => {
    const { v } = validador({
      policy: { gatekeeperDomains: [], maxRetries: 3 },
      resposta: respostaBase({
        verdict: 'denied',
        deniedDomain: 'physicalLaw',
        worldMutations: [],
        agentFeedback: 'Seus pés não deixam o chão.',
      }),
    });
    expect((await v.mediate(pedido(), VARIAVEIS)).retry).toBeUndefined();
  });

  // Invocacao recorrente do mesmo metodo e sinal de que falta regra
  // deterministica, e cada uma que falta e uma chamada por ocorrencia.
  it('o mesmo método invocado três vezes aparece no topo da dívida', async () => {
    const { v } = validador({ resposta: respostaBase({ worldMutations: [EFEITO_NOVO] }) });
    for (let i = 0; i < 3; i++) await v.mediate(pedido({ actionId: `act-${i}` }), VARIAVEIS);
    await v.mediate(pedido({ actionType: 'outra_coisa', actionId: 'z' }), VARIAVEIS);
    const ranking = v.debtRanking();
    expect(ranking[0]).toEqual({ method: 'rub_sticks::gravetos-1', invocations: 3 });
  });

  it('o método que virou regra sai da dívida', async () => {
    const { v } = validador({
      resposta: respostaBase({
        worldMutations: [EFEITO_NOVO],
        generalization: {
          verdict: 'systemic',
          domain: 'substrate',
          rule: { when: 'contact', effect: 'ignite', chance: 0.4 },
          reasoning: 'atrito acende',
        },
      }),
    });
    await v.mediate(pedido(), VARIAVEIS);
    expect(v.debtRanking()).toHaveLength(0);
  });
});
