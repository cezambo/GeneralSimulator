/* eslint-disable */
/**
 * GERADO DE schemas/llm-io.schema.json. NÃO EDITAR À MÃO.
 *
 * Regerar com `npm run types`. X-009.
 */
export type Classifications = {
  impressionId: string;
  opinionId: string;
  relation: 'conflito' | 'sinergia';
  intensity: number;
  reason?: string;
}[];
export type Verdicts = {
  /**
   * O tema afirmado, numa frase, extraído do que foi dito.
   */
  claim: string;
  topic?: string;
  sourceAgentId?: string | null;
  /**
   * Saída do Crivo: o que o indivíduo faz com cada tema que ouviu. 'true' entra no banco de fatos; 'possible' fica em suspenso e volta a ser avaliado se corroborado; 'uninteresting' é descartado por desinteresse; 'ignored' é descartado de propósito, o que é caracterização e não filtro; 'false' vai para a memória de mentiras. C-047.
   */
  verdict: 'true' | 'possible' | 'uninteresting' | 'ignored' | 'false';
  /**
   * Por que este agente, com esta memória e esta personalidade, reage assim. É o que distingue descartar por tédio de descartar de propósito.
   */
  reason?: string;
  confidence?: number;
}[];
/**
 * C-037. Retornar null quando nada puxa o agente.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "whim_response".
 */
export type WhimResponse = {
  whimText: string;
  estimatedMinutes: number;
  trigger?: 'tedio' | 'traco' | 'memoria' | 'ambiente';
} & WhimResponse1;
export type WhimResponse1 = {
  whimText: string;
  estimatedMinutes: number;
  trigger?: 'tedio' | 'traco' | 'memoria' | 'ambiente';
} | null;
/**
 * Cartela de perguntas variadas com a resposta típica daquele indivíduo, gerada uma vez junto do perfil. Serve de âncora de estilo: um subconjunto entra no contexto dos prompts de fala, e o modelo passa a ter exemplo concreto da voz em vez de apenas adjetivos de personalidade. Custo marginal zero em jogo, porque sai na chamada de perfil que já existe. É o conserto mais barato para deriva de voz, que é o primeiro defeito que aparece em modelo fraco. C-056.
 */
export type VoiceCard = {
  question: string;
  /**
   * Na voz do personagem, dentro do teto de palavras declarado em tuning.
   */
  answer: string;
}[];

export interface LlmIo {
  agent_thought_response?: AgentThoughtResponse;
  personality_drift_response?: PersonalityDriftResponse;
  nightly_appraisal_response?: NightlyAppraisalResponse;
  memory_summary_response?: MemorySummaryResponse;
  longterm_memory_response?: LongtermMemoryResponse;
  dissonance_classification_response?: DissonanceClassificationResponse;
  sieve_response?: SieveResponse;
  self_understanding_response?: SelfUnderstandingResponse;
  opinion_burst_response?: OpinionBurstResponse;
  nightly_reflection_response?: NightlyReflectionResponse;
  goal_revise_response?: GoalReviseResponse;
  whim_response?: WhimResponse;
  handshake_response?: HandshakeResponse;
  conversation_turn_response?: ConversationTurnResponse;
  relocation_vote_response?: RelocationVoteResponse;
  post_conversation_response?: PostConversationResponse;
  meeting_verdict_response?: MeetingVerdictResponse;
  generalization?: Generalization;
  gm_response?: GmResponse;
  terrain_params_response?: TerrainParamsResponse;
  agent_profile_response?: AgentProfileResponse;
  item_definition?: ObjectDef;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "agent_thought_response".
 */
export interface AgentThoughtResponse {
  /**
   * Monólogo interior in-character.
   */
  thought: string;
  decision: {
    actionType:
      | 'move'
      | 'interact'
      | 'speak'
      | 'wait'
      | 'sleep'
      | 'eat'
      | 'drink'
      | 'work'
      | 'follow'
      | 'flee'
      | 'attack'
      | 'use_item'
      | 'pick_up'
      | 'drop'
      | 'give'
      | 'open_conversation'
      | 'none';
    targetId?: string | null;
    targetLabel?: string | null;
    destination?: {
      x?: number;
      y?: number;
    } | null;
    /**
     * Linguagem natural, é o que o GM lê.
     */
    intentDescription: string;
    speech?: string | null;
  };
  /**
   * C-053. O quanto este instante marcou o agente, avaliado por ele no instante em que o viveu — não por um modelo relendo o dia depois. A engine compara a nota ao limiar derivado de consciência e atenção: acima, o texto vira memória; abaixo, nada acontece e o instante se perde, que é o comportamento correto. Custa zero chamada porque vem na mesma resposta que já decidiu a ação.
   */
  memorability?: {
    score: number;
    /**
     * O fato que marcou, numa frase e em primeira pessoa. Só preenchido quando a nota é diferente de zero — é o texto que vira memória se passar do limiar.
     */
    what?: string;
  };
  meta?: {
    /**
     * C-051. Só oferecido quando o orçamento de pensamento profundo do agente é maior que zero e ainda tem saldo.
     */
    requestedDeepThinking?: boolean;
    emotion?: string;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
  };
}
/**
 * A-021. Deltas pequenos. O texto só muda se algum traço cruzar limiar.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "personality_drift_response".
 */
export interface PersonalityDriftResponse {
  deltas: {
    trait: string;
    delta: number;
    reason: string;
  }[];
  newTraitsText?: string | null;
}
/**
 * C-047 e C-025. A apreciação noturna: uma só chamada resolve o Crivo e a passagem noturna da classificação de dissonância. As duas tarefas leem o mesmo material do dia contra o mesmo contexto pessoal, e mantê-las separadas pagaria uma chamada por agente por noite apenas para renderizar esse contexto duas vezes.
 *
 * As duas listas referenciam as definições originais por ponteiro, e não por cópia, para que não possam divergir. A passagem a quente da classificação vive em `post_conversation_response`, logo ao fim da conversa, porque a ruptura precisa poder acontecer no mesmo dia; com as duas cadências fundidas nos hospedeiros, o prompt `cognition.dissonance_classifier` foi aposentado.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "nightly_appraisal_response".
 */
export interface NightlyAppraisalResponse {
  classifications: Classifications;
  verdicts: Verdicts;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "memory_summary_response".
 */
export interface MemorySummaryResponse {
  summary: string;
  preservedMarcantes?: string[];
  discardedTopics?: string[];
}
/**
 * C-017. Um schema para anual, quinquenal, decadal e era. O nível é variável de entrada.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "longterm_memory_response".
 */
export interface LongtermMemoryResponse {
  /**
   * Dois parágrafos atemporais.
   */
  general: string;
  /**
   * Dois parágrafos sobre relações.
   */
  social: string;
  /**
   * @minItems 3
   * @maxItems 5
   */
  marcantes:
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string];
}
/**
 * C-025. Uma chamada cobre todas as impressões contra todas as opiniões. Pares sem relação são omitidos.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "dissonance_classification_response".
 */
export interface DissonanceClassificationResponse {
  classifications: Classifications;
}
/**
 * C-047. O Crivo. Tudo que o agente ouviu no período é destrinchado em temas e cada tema recebe um veredito à luz do contexto pessoal e do texto original. Roda em lote, uma chamada por agente por noite, junto do resto do lote — por tema seria o pior perfil de volume possível.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "sieve_response".
 */
export interface SieveResponse {
  verdicts: Verdicts;
}
/**
 * C-050. Como o agente se vê agora, a partir do que viveu desde a última vez. Gerado esporadicamente, cadência em tuning.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "self_understanding_response".
 */
export interface SelfUnderstandingResponse {
  /**
   * Primeira pessoa, atemporal, dentro do teto de palavras de tuning.
   */
  text: string;
  /**
   * Falso quando nada mudou, e nesse caso o auto-entendimento anterior é preservado sem gravar versão nova.
   */
  changedFromPrevious?: boolean;
  /**
   * Uma frase sobre o que mudou. Alimenta a timeline e o export narrativo.
   */
  changeSummary?: string;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "opinion_burst_response".
 */
export interface OpinionBurstResponse {
  /**
   * 1 a 3 frases atemporais.
   */
  newNuanceDescription: string;
  /**
   * Compressão da nuance — viés relacional canônico.
   */
  stance:
    | 'trust'
    | 'distrust'
    | 'admire'
    | 'pity'
    | 'resent'
    | 'indifferent'
    | 'fear'
    | 'desire'
    | 'neutral';
  /**
   * Tópico canônico para pré-filtro downstream.
   */
  topic?: string;
  emotionalTone?: string;
  severity?: 'nuance_shift' | 'inversao';
}
/**
 * C-031. Lote noturno das opiniões gerais.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "nightly_reflection_response".
 */
export interface NightlyReflectionResponse {
  impressions: {
    id: string;
    text: string;
    topic?: string;
  }[];
  /**
   * Tópicos sobre os quais o agente ainda não tinha crença formada.
   */
  newOpinionCandidates?: {
    targetLabel: string;
    nuanceDescription: string;
  }[];
}
/**
 * C-040 a C-044. Um schema para toda revisão de meta, qualquer nível e qualquer gatilho.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "goal_revise_response".
 */
export interface GoalReviseResponse {
  /**
   * Verbo mais objeto. Nada de meta vaga.
   */
  goalText: string;
  rationale: string;
  deprecatedReason?: string | null;
  /**
   * Níveis abaixo que a mudança invalidou.
   */
  alsoRevise?: ('secondary' | 'tertiary')[];
}
/**
 * S-002.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "handshake_response".
 */
export interface HandshakeResponse {
  accept: boolean;
  reason?: string;
  openingLine?: string | null;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "conversation_turn_response".
 */
export interface ConversationTurnResponse {
  dialogueText: string;
  relocationProposal?: {
    targetLocationLabel?: string;
    coordinates?: {
      x?: number;
      y?: number;
    };
    reason?: string;
  } | null;
  endConversation?: boolean;
  requestExtension?: boolean;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "relocation_vote_response".
 */
export interface RelocationVoteResponse {
  vote: 'accept' | 'deny';
  /**
   * Obrigatória em caso de deny. Vira fala.
   */
  explanation?: string;
}
/**
 * S-012, S-014, C-025. A apreciação a quente: tirar as impressões da conversa e classificá-las contra as opiniões de quem as teve, numa chamada só.
 *
 * Este prompt produzia só as impressões, e o classificador de dissonância era chamado logo em seguida para relê-las contra as mesmas opiniões — mesmo material, dois renders, uma chamada por participante por conversa. É a mesma fusão já feita para o lote noturno em `nightly_appraisal_response`, aplicada ao par que dispara com mais frequência.
 *
 * O agente classifica o que ele mesmo acabou de sentir, o que é mais fácil que classificar impressão alheia, e não mais difícil.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "post_conversation_response".
 */
export interface PostConversationResponse {
  classifications: Classifications;
  rawImpressions: {
    id: string;
    text: string;
    aboutAgentId?: string | null;
  }[];
  sentimentDeltas: {
    agentId: string;
    delta: number;
  }[];
  /**
   * Gera intenção de retomar a conversa. S-011.
   */
  unresolvedTopic?: string | null;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "meeting_verdict_response".
 */
export interface MeetingVerdictResponse {
  meetingType?: string;
  consensusNarrative: string;
  goalOperations: {
    action: 'add' | 'remove' | 'modify';
    id?: string;
    text: string;
  }[];
  mechanicChanges: {
    target: string;
    value: string;
    rationale: string;
  }[];
  newLaws?: string[];
  dissent?: {
    agentId: string;
    reason: string;
  }[];
}
/**
 * Promoção generalizada cross-domain (R-046, B-045). Regra provisória entra viva imediatamente.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "generalization".
 */
export interface Generalization {
  verdict: 'systemic' | 'one_off';
  /**
   * Obrigatório quando verdict é systemic. O domínio `object` exige também o `defId` do alvo no corpo da regra. V-041.
   */
  domain?: 'substrate' | 'body' | 'social' | 'cognition' | 'community' | 'object';
  /**
   * Presente só se verdict==systemic. Forma depende do domain — vocabulário fechado.
   */
  rule?: {
    [k: string]: unknown;
  };
  reasoning: string;
}
/**
 * V-004 e V-035. Postura permissiva fora dos domínios de porteiro: denied é último recurso e só é recuperável por nova tentativa dentro dos domínios declarados em ValidationPolicy. Emite consequences quando o desfecho não é certo, e generalization quando o julgamento generaliza.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "gm_response".
 */
export interface GmResponse {
  verdict: 'executed' | 'partial' | 'reinterpreted' | 'denied';
  /**
   * Terceira pessoa, para a timeline. O log causal de X-005 é o registro do que aconteceu; esta narrativa é só apresentação.
   */
  narrative: string;
  /**
   * V-037. O caminho que levou ao veredito: que propriedades foram consideradas, que capacidade de quem foi pesada, por que o desfecho é esse. Auditável e nunca mostrado ao agente.
   */
  reasoning?: string;
  /**
   * Obrigatório quando verdict é denied. Se o domínio não consta em ValidationPolicy.gatekeeperDomains, a negação é final e não gera nova tentativa. V-036.
   */
  deniedDomain?:
    | 'physicalLaw'
    | 'inviolableLaw'
    | 'userProhibition'
    | 'bodyIntegrity'
    | 'socialNorm'
    | 'resourceConservation';
  /**
   * Mutações certas — as que acontecem independentemente de rolagem.
   */
  worldMutations: WorldMutation[];
  /**
   * V-038. Desfechos possíveis com probabilidade estimada. A engine rola com dado semeado em (simTime, agentId, actionId), então a partida continua reproduzível pelo cassete. A maior parte das ações não deveria produzir nada aqui: desfecho certo vai em worldMutations e não é sorteado.
   */
  consequences?: {
    description: string;
    probability: number;
    mutations: WorldMutation[];
    /**
     * Desfechos do mesmo grupo são mutuamente exclusivos e suas probabilidades precisam somar 100. Desfechos sem grupo são rolados de forma independente.
     */
    exclusiveGroup?: string;
  }[];
  /**
   * Sensorial e diegético. Nunca linguagem de sistema.
   */
  agentFeedback: string;
  generalization: Generalization;
  /**
   * V-042. Informação que o julgamento revelou e que vale gravar na descrição do objeto, para poupar raciocínio nas próximas vezes. Sensorial é pública; funcional é oculta. V-042.
   */
  descriptionUpdate?: {
    defId?: string;
    sensoryAddendum?: string;
    functionalAddendum?: string;
  };
  /**
   * Affordances que este julgamento passa a habilitar no alvo. V-041.
   */
  followUpAffordances?: string[];
  /**
   * V-019. Sinalização, não decisão: quem pontua o quanto marcou é o agente, em C-053.
   */
  isMarcanteCandidate?: boolean;
  witnessIds?: string[];
}
/**
 * V-005. Alteração concreta emitida pelo GM.
 */
export interface WorldMutation {
  type:
    | 'agent_state'
    | 'tile_state'
    | 'object_state'
    | 'inventory'
    | 'relationship'
    | 'global_event'
    | 'spawn_object'
    | 'destroy_object'
    | 'community_mechanic'
    | 'engine_effect';
  target: string;
  /**
   * Campos alterados. O validador rejeita qualquer caminho marcado com x-derived neste schema — capacidades, isAlive, estágio de condição — porque são recalculados e a escrita seria um no-op silencioso. O GM muta causa; a engine deriva o resto. B-036.
   */
  changes: {
    [k: string]: unknown;
  };
  /**
   * Obrigatório quando type é engine_effect. Identificador do vocabulário fechado de R-015 — para tiles, objetos e partes de corpo, incluindo transmute — ou de B-037, para as operações biológicas. A partir da invocação a engine assume a simulação. Sujeito ao registro de plausibilidade do cenário. R-043, B-037, B-044.
   */
  effectId?: string;
  /**
   * Parte do corpo alvo, quando o efeito incide sobre um agente. Ausente significa corpo inteiro. B-037.
   */
  targetPartId?: string;
  /**
   * Justificativa auditável. V-020. Em engine_effect, deve explicar por que nenhuma regra da matriz de reação ou de lesão já cobria o caso. R-044, B-043.
   */
  rationale?: string;
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "terrain_params_response".
 */
export interface TerrainParamsResponse {
  seed: number;
  /**
   * Em tiles de 0,5 m. O teto subiu de 128 porque a 0,5 m um grid de 128 daria um mundo de 64 m, menor que um quarteirão. W-001.
   */
  mapWidth: number;
  mapHeight: number;
  waterRatio: number;
  waterStyle?: 'lago' | 'rio' | 'costa' | 'pantano' | 'nenhum';
  elevationVariance?: number;
  biomePrimary: 'floresta' | 'planicie' | 'urbano' | 'costeiro' | 'arido' | 'montanhoso';
  roadDensity?: number;
  vegetationDensity?: number;
  urbanDensity: number;
  climate: 'temperado' | 'arido' | 'frio' | 'tropical';
  dangerZones?: string[];
  /**
   * 2 a 3 frases. Alimenta o construtor e os perfis.
   */
  scenarioNarrative: string;
  /**
   * V-014. Regras do cenário que o GM não contorna.
   */
  inviolableLaws?: string[];
}
/**
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "agent_profile_response".
 */
export interface AgentProfileResponse {
  name: string;
  age: number;
  appearanceDescription: string;
  personality: Personality;
  voiceCard: VoiceCard;
  skills: Skills;
  initialRole: string;
  primaryGoalSeed: string;
  secondaryGoalSeed: string;
  initialOpinions?: {
    kind?: 'general' | 'social';
    targetLabel: string;
    nuanceDescription: string;
  }[];
  relationshipSeeds?: {
    targetHint: string;
    sentiment: number;
    kind?: string;
    reason: string;
  }[];
  spawnPreference?: 'near_residential' | 'near_work' | 'central';
}
/**
 * A-020. Traços numéricos guiam mecânica; o texto guia tom.
 */
export interface Personality {
  /**
   * 2 a 4 frases. Editável pelo usuário.
   */
  traitsText: string;
  bigFive: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  custom: {
    /**
     * Governa o tamanho do orçamento de pensamento profundo. Abaixo do limiar declarado em tuning o orçamento é zero e a opção de deliberar nem é oferecida ao agente — o que produz um indivíduo que age por impulso por incapacidade, e não por estar mal escrito. C-051.
     */
    intelligence?: number;
    /**
     * Modula o limiar de lembrabilidade: quem presta mais atenção retém fatos que passariam batido pelos outros. Junto com a consciência corrente, converte a nota de 0 a 10 da decisão em 'isto virou memória' ou 'isto não deixou marca'. C-052.
     */
    attention?: number;
    /**
     * Base do limiar de teimosia. C-027.
     */
    stubbornness?: number;
    /**
     * Modula relato verbal. C-019.
     */
    honesty?: number;
    aggression?: number;
    empathy?: number;
    curiosity?: number;
    laziness?: number;
    bravery?: number;
  };
}
/**
 * A-022. Alimenta MaxTurns de conversa e seleção de comitê.
 */
export interface Skills {
  [k: string]: number;
}
/**
 * Molde reutilizável de objeto. O que é constante ao tipo vive aqui; o que varia por exemplar vive em WorldObject. W-030.
 *
 * This interface was referenced by `LlmIo`'s JSON-Schema
 * via the `definition` "item_definition".
 */
export interface ObjectDef {
  id: string;
  name: string;
  /**
   * Glosa de uma linha, para listas e UI. Não é nenhuma das duas descrições de O-020.
   */
  description: string;
  /**
   * Tudo que pode ser percebido do objeto por qualquer sentido: forma, estética, cheiro, som, textura. Pública — vai para quem quer que perceba o objeto. Nunca contém como a coisa funciona. O-020.
   */
  sensoryDescription: string;
  /**
   * Como o objeto realmente funciona. Oculta dos agentes e é a fonte que o VALIDADOR consulta. A separação é o que permite um agente usar algo errado de forma plausível: ele decide pela descrição sensorial e pela própria crença, nunca por esta. O-020, V-043.
   */
  functionalDescription: string;
  category:
    'tool' | 'furniture' | 'decoration' | 'consumable' | 'container' | 'clothing' | 'weapon';
  materialId: string;
  size: {
    w: number;
    h: number;
  };
  /**
   * Quilogramas. Soma para a carga do portador e para a penalidade de movimento. O-001.
   */
  weight: number;
  /**
   * Metros cúbicos de matéria efetiva, sem contar o desperdício de forma. O-001.
   */
  volume: number;
  /**
   * PEM: quão trambolhudo é o objeto. Multiplica o volume para dar o volume realmente ocupado quando guardado. Um cubo perfeito vale 1; um par de galhadas vale muito mais. Um local de armazenamento feito sob medida para o objeto reduz o multiplicador. O-002.
   */
  packingEfficiency: number;
  /**
   * Quantos exemplares formam uma pilha, quando o tipo empilha. Ausente significa que o objeto não empilha. O-007.
   */
  stackLimit?: number;
  grabbable?: boolean;
  equippable?: boolean;
  slot?: 'hand' | 'worn' | 'none';
  isContainer?: boolean;
  /**
   * Volume interno em metros cúbicos. Substitui a contagem de itens: o que limita é o volume efetivo somado, não a quantidade. O-003.
   */
  containerVolume?: number;
  /**
   * Quanto líquido o exemplar aguarda, em metros cúbicos. Independente de `volume`: um cantil ocupa mais espaço na mochila do que a água que leva dentro, e a diferença é a parede. Ausente ou zero significa que o objeto não segura líquido. O-029.
   */
  liquidCapacity?: number;
  /**
   * Identificadores de ObjectDef para os quais este container foi feito. O PEM desses objetos cai ao valor declarado em tuning quando guardados aqui — é o que faz uma aljava valer mais que um saco para flechas. O-002.
   */
  fittedFor?: string[];
  affordances: string[];
  /**
   * O Funcionamento: regras determinísticas que resolvem o uso do objeto sem chamar o VALIDADOR. Cresce ao longo da partida por promoção. O-021.
   */
  functionRules?: ItemRule[];
  customProperties?: {
    [k: string]: unknown;
  };
  /**
   * Criado pelo usuário no modo construção. W-034.
   */
  userCreated?: boolean;
}
/**
 * Uma regra do Funcionamento de um objeto. Nasce de um julgamento do VALIDADOR que generalizou: em vez de rechamar o modelo toda vez que alguém tentar a mesma coisa com o mesmo tipo de objeto, a resposta passa a ser determinística. Mesmo ciclo de vida de ProvisionalRule. O-021, V-041.
 */
export interface ItemRule {
  id: string;
  /**
   * Que tentativa de uso esta regra intercepta, no vocabulário fechado do domínio.
   */
  trigger: {
    [k: string]: unknown;
  };
  /**
   * afford habilita a ação; refuse a impede com retorno diegético; effect a executa invocando um efeito da engine.
   */
  outcome: 'afford' | 'refuse' | 'effect';
  /**
   * Obrigatório quando outcome é effect.
   */
  effectId?: string;
  /**
   * O que o agente sente ou percebe. Nunca linguagem de sistema. V-006.
   */
  diegeticText?: string;
  state?: 'provisional' | 'permanent' | 'rejected';
  sourceJudgmentId?: string;
  fireCount?: number;
}
