/* eslint-disable */
/**
 * GERADO DE schemas/domain.schema.json. NÃO EDITAR À MÃO.
 *
 * Regerar com `npm run types`. X-009.
 */
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "TileType".
 */
export type TileType = 'floor' | 'wall' | 'door' | 'window' | 'roof' | 'water' | 'road';
/**
 * Ação que o objeto declara suportar. Alimenta as opções apresentadas ao agente e ao GM.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Affordance".
 */
export type Affordance = string;
/**
 * Saída do Crivo: o que o indivíduo faz com cada tema que ouviu. 'true' entra no banco de fatos; 'possible' fica em suspenso e volta a ser avaliado se corroborado; 'uninteresting' é descartado por desinteresse; 'ignored' é descartado de propósito, o que é caracterização e não filtro; 'false' vai para a memória de mentiras. C-047.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SieveVerdict".
 */
export type SieveVerdict = 'true' | 'possible' | 'uninteresting' | 'ignored' | 'false';
/**
 * Cartela de perguntas variadas com a resposta típica daquele indivíduo, gerada uma vez junto do perfil. Serve de âncora de estilo: um subconjunto entra no contexto dos prompts de fala, e o modelo passa a ter exemplo concreto da voz em vez de apenas adjetivos de personalidade. Custo marginal zero em jogo, porque sai na chamada de perfil que já existe. É o conserto mais barato para deriva de voz, que é o primeiro defeito que aparece em modelo fraco. C-056.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "VoiceCard".
 */
export type VoiceCard = {
  question: string;
  /**
   * Na voz do personagem, dentro do teto de palavras declarado em tuning.
   */
  answer: string;
}[];
/**
 * Vocabulário fechado de dano. Uma só lista serve à resistência de material, à matriz de lesão e à resolução mecânica de agressão — não há tabela de armas separada. Os nomes vêm da matriz de lesão, que é o consumidor mais expressivo: 'blunt' absorve o antigo 'impact' da resistência de material e 'burn' absorve o antigo 'fire', que colidia com o estado transitório 'burning'. R-027, B-020, B-052.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "DamageType".
 */
export type DamageType = 'blunt' | 'cut' | 'pierce' | 'burn' | 'cold' | 'electric' | 'corrosion';
/**
 * Vocabulário canônico do que provoca um pensamento. Enumerado aqui, e não em prosa, porque quatro documentos haviam divergido silenciosamente sobre esta lista. Prompt, spec e engine usam estes nomes. C-003.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ThoughtTrigger".
 */
export type ThoughtTrigger =
  | 'reactive'
  | 'scheduled'
  | 'contemplative'
  | 'spontaneous'
  | 'postInteraction'
  | 'postDenial'
  | 'wakeUp'
  | 'meeting';
/**
 * Pares alternados de valor e contagem, em ordem de varredura por linha: [valor, quantas, valor, quantas, ...]. A soma das contagens é exatamente width × height, e é essa igualdade que torna a decodificação verificável em vez de confiável.
 *
 * @minItems 0
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "RunLengthRuns".
 */
export type RunLengthRuns = number[];
/**
 * Pares alternados de valor e contagem, em ordem de varredura por linha: [valor, quantas, valor, quantas, ...]. A soma das contagens é exatamente width × height, e é essa igualdade que torna a decodificação verificável em vez de confiável.
 *
 * @minItems 0
 */
export type RunLengthRuns1 = number[];

export interface Domain {
  Vec2?: Vec2;
  GridPos?: GridPos;
  Material?: Material;
  TransientState?: TransientState;
  Covering?: Covering;
  Substance?: Substance;
  TileType?: TileType;
  Grid?: Grid;
  Tile?: Tile;
  Affordance?: Affordance;
  ObjectDef?: ObjectDef;
  ItemRule?: ItemRule;
  ItemBelief?: ItemBelief;
  WorldObject?: WorldObject;
  CompositeStructure?: CompositeStructure1;
  Biology?: Biology;
  BodyPartState?: BodyPartState;
  Condition?: Condition;
  Capacities?: Capacities;
  Personality?: Personality;
  Skills?: Skills;
  Opinion?: Opinion;
  MemoryEntry?: MemoryEntry;
  SieveVerdict?: SieveVerdict;
  FactBankEntry?: FactBankEntry;
  LiquidVolume?: LiquidVolume2;
  VoiceCard?: VoiceCard;
  SelfUnderstanding?: SelfUnderstanding;
  ActivityLogEntry?: ActivityLogEntry;
  Goal?: Goal;
  InventorySlot?: InventorySlot;
  Relationship?: Relationship;
  Routine?: Routine;
  Agent?: Agent;
  CommunityLaw?: CommunityLaw;
  WorldMutation?: WorldMutation;
  Clock?: Clock;
  DamageType?: DamageType;
  ThoughtTrigger?: ThoughtTrigger;
  ConversationInstance?: ConversationInstance;
  PerceptibleFact?: PerceptibleFact;
  RawImpression?: RawImpression;
  ProvisionalRule?: ProvisionalRule;
  CommunityGoal?: CommunityGoal;
  FormulaBinding?: FormulaBinding1;
  ValidationPolicy?: ValidationPolicy;
  PlausibilityRegistry?: PlausibilityRegistry;
  CausalEntry?: CausalEntry;
  RngCursor?: RngCursor;
  GridTileLayers?: GridTileLayers;
  RunLengthRuns?: RunLengthRuns;
  TileOverlay?: TileOverlay;
  SaveManifest?: SaveManifest;
  SimulationState?: SimulationState;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Vec2".
 */
export interface Vec2 {
  x: number;
  y: number;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "GridPos".
 */
export interface GridPos {
  x: number;
  y: number;
}
/**
 * Entrada do catálogo único de matéria. Cobre tanto materiais do mundo — carvalho, ferro, vidro — quanto tecidos do corpo — pele, músculo, osso, órgão, nervo. Não existe segundo catálogo: 'osso' é uma entrada só, e serve para um porrete e para um fêmur. É essa unificação que permite ao GM transmutar o material de uma parte do corpo sem código novo. W-011, B-003, B-038.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Material".
 */
export interface Material {
  id: string;
  name: string;
  /**
   * Material é matéria estável; elemento é condição instável. A matriz de reação só admite elemento→material, elemento→elemento, nunca material→material. R-002, R-003.
   */
  category: 'material' | 'element';
  /**
   * Texto enviado ao GM para decisões nuançadas. W-014.
   */
  description: string;
  /**
   * Etiquetas arbitrárias além das booleanas. Regras do substrato e da matriz de lesão referenciam etiquetas, nunca identificadores de material. R-001, B-020. Etiquetas com significado biológico: 'tissue' — pode compor uma parte do corpo por padrão; 'living' — cicatriza, apodrece e adoece, e sua ausência faz a parte se comportar como objeto; 'vascular' — sangra ao ser ferida e aceita o vetor de injeção. B-003.
   */
  tags?: string[];
  /**
   * Etiquetas booleanas canônicas, com efeito determinístico na engine. W-012.
   */
  properties: {
    inflammable?: boolean;
    waterSensitive?: boolean;
    conductive?: boolean;
    sharp?: boolean;
    toxic?: boolean;
    edible?: boolean;
    potable?: boolean;
    fragile?: boolean;
    buoyant?: boolean;
    insulating?: boolean;
    transparent?: boolean;
    magnetic?: boolean;
    organic?: boolean;
    slippery?: boolean;
    absorbent?: boolean;
    corrosive?: boolean;
    luminous?: boolean;
    soundproof?: boolean;
  };
  /**
   * W-013.
   */
  numeric: {
    hardness?: number;
    density?: number;
    /**
     * Resistência a mudar de temperatura. A cada tick a entidade move sua temperatura em direção ao ambiente pela diferença dividida por este valor. R-008.
     */
    specificHeat?: number;
    /**
     * Perda de integridade por dia simulado.
     */
    decayRate?: number;
    flammabilitySpeed?: number;
    nutritionValue?: number;
    toxicity?: number;
    /**
     * Multiplicador de sangramento quando este material compõe uma parte ferida. Só faz sentido em materiais com a etiqueta 'vascular'. B-017.
     */
    bleedFactor?: number;
  };
  /**
   * Limiares térmicos. Todos opcionais: um ausente significa que a transição nunca ocorre por temperatura. Substituem reações discretas de derreter, congelar, ferver e incendiar. R-009.
   */
  thermal?: {
    brittlePoint?: number;
    freezePoint?: number;
    meltPoint?: number;
    boilPoint?: number;
    ignitePoint?: number;
    heatDamagePoint?: number;
    coldDamagePoint?: number;
    /**
     * Quando presente, a temperatura é imune à convergência. R-010.
     */
    fixedTemperature?: number;
  };
  /**
   * Resistência por tipo de dano, 0 a 1. As chaves são o vocabulário fechado de DamageType — amarrado por referência, e não repetido, para que material e matriz de lesão não possam divergir. R-027, B-020.
   */
  damageResistance?: {
    [k: string]: number;
  };
  /**
   * No que se transforma ao ter integridade zerada. R-027.
   */
  rubbleMaterialId?: string;
  meltsTo?: string;
  freezesTo?: string;
  boilsTo?: string;
  burnsTo?: string;
  /**
   * Comentário livre no arquivo de dados. Ignorado pela engine.
   */
  _nota?: string;
}
/**
 * Condição transitória sobre tile, objeto ou criatura. Várias coexistem e cada uma decai no seu ritmo. R-004.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "TransientState".
 */
export interface TransientState {
  /**
   * burning, wet, frozen, electrified, slippery, contaminated, smoky, stained.
   */
  type: string;
  intensity: number;
  /**
   * Ausente significa duração indefinida até que uma regra mude.
   */
  remainingTicks?: number;
  /**
   * Origem causal, para o log de R-048.
   */
  sourceId?: string;
}
/**
 * Substância que recobre tile, objeto ou parte de corpo. Persiste, é descrita textualmente e é perceptível por terceiros. É o principal canal do substrato físico para a cognição social. R-025.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Covering".
 */
export interface Covering {
  substanceId: string;
  amount: number;
  /**
   * 1 é recém-aplicada; 0 é completamente seca ou velha. Afeta remoção e descrição. R-026.
   */
  freshness?: number;
  appliedAtTick?: number;
}
/**
 * Material que carrega payload de efeitos sobre um corpo. Um mecanismo do qual saem veneno, álcool, remédio, droga, alergia e doença. R-029, R-030.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Substance".
 */
export interface Substance {
  id: string;
  name: string;
  /**
   * Por onde entra no corpo. R-030.
   *
   * @minItems 1
   */
  vectors: [
    'contact' | 'inhalation' | 'ingestion' | 'injection',
    ...('contact' | 'inhalation' | 'ingestion' | 'injection')[]
  ];
  /**
   * R-032.
   */
  contagious?: boolean;
  incubationTicks?: number;
  effects: {
    /**
     * Os cognitivos entram no contexto enviado ao modelo. `toxicLoad` deposita carga tóxica nas partes expostas em vez de ferir: sem ele uma fonte de radiação só consegue se expressar como dano e dor, e veneno lento não teria como existir sem subsistema próprio. R-031, B-062.
     */
    kind:
      | 'damage'
      | 'pain'
      | 'nausea'
      | 'drowsiness'
      | 'unconsciousness'
      | 'healing'
      | 'disinhibition'
      | 'moodShift'
      | 'perceptionDistortion'
      | 'paranoia'
      | 'euphoria'
      | 'toxicLoad';
    severity: number;
    delayTicks?: number;
    durationTicks?: number;
  }[];
}
/**
 * Uma malha de tiles. O mundo é 2.5D: o plano continua bidimensional, e a terceira dimensão vem de grids empilhados mais a altura contínua dentro de cada célula. Andar superior, porão e caverna são grids; sótão dentro de uma caixa mágica também, com regra de alinhamento diferente. W-059.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Grid".
 */
export interface Grid {
  id: string;
  /**
   * Rótulo legível: 'segundo andar', 'adega'.
   */
  name?: string;
  width: number;
  height: number;
  /**
   * Alinhado partilha o sistema de coordenadas do grid principal, então uma célula daqui corresponde a uma célula de lá e cair por um buraco leva ao lugar certo embaixo. Destacado é espaço extraespacial: não corresponde a lugar nenhum e só é alcançável pela entrada declarada. W-060, W-061.
   */
  alignment: 'aligned' | 'detached';
  /**
   * Ordem de empilhamento entre grids alinhados. Só tem significado quando alignment é aligned. Maior está por cima.
   */
  zLevel?: number;
  originOffset?: GridPos1;
  entranceTilePos?: GridPos2;
  /**
   * Grid onde a entrada de um destacado se abre.
   */
  entranceFromGridId?: string;
}
/**
 * Deslocamento da origem deste grid em relação ao principal. Permite um andar menor que a planta baixa. Só se aplica a grid alinhado.
 */
export interface GridPos1 {
  x: number;
  y: number;
}
/**
 * Única entrada de um grid destacado, expressa como célula do grid que a contém. Obrigatório quando alignment é detached: espaço sem entrada é inalcançável e não deveria existir. W-061.
 */
export interface GridPos2 {
  x: number;
  y: number;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Tile".
 */
export interface Tile {
  type: TileType;
  materialId: string;
  pos: GridPos;
  /**
   * Grid a que esta célula pertence. Ausente significa o grid principal. W-059.
   */
  gridId?: string;
  /**
   * Altura do solo desta célula, em metros, relativa ao plano do grid. Contínua e interpolada: uma entidade que ocupa mais de uma célula recebe a média ponderada pela fração ocupada, e não o valor de uma célula só. Governa escoamento de líquido, assentamento de gás pesado e queda. W-063, W-064, R-016, R-022.
   */
  baseHeight?: number;
  /**
   * Altura do material do tile sobre o solo, em metros. Separado de baseHeight porque uma mureta sobre terreno plano e um degrau de rocha são coisas diferentes: a primeira pode ser derrubada sem alterar o solo. W-063.
   */
  tileHeight?: number;
  /**
   * Pressão ambiente, em atmosferas. Valor contínuo interpolado. Descritor ambiental, não fluidodinâmica: governa respiração e conforto nos extremos, e nada mais. W-068.
   */
  pressure?: number;
  /**
   * Multiplicador de gravidade local; 1 é o padrão. Valor contínuo interpolado. Ausente equivale a 1. W-065.
   */
  gravityMultiplier?: number;
  /**
   * Quanto do volume da célula está tomado e por quem. Governa passagem, cobertura e aperto. Objeto grande e imóvel, indivíduo e objeto físico entram todos aqui; o que está guardado não entra. W-066.
   */
  occupancy?: {
    fraction?: number;
    occupantIds?: string[];
  };
  /**
   * Objetos guardados na célula, cuja soma de volumes efetivos cabe no teto declarado em tuning. O que guardar significa está em O-009; o que este campo acrescenta é que guardado não entra em occupancy — a diferença entre uma despensa arrumada e um cômodo entulhado. W-067, O-009.
   */
  storedObjectIds?: string[];
  rotation?: 0 | 90 | 180 | 270;
  integrity?: number;
  /**
   * R-007.
   */
  temperature?: number;
  /**
   * Propriedades mecânicas do tipo de tile. Estado físico transitório não vive aqui — vive em states. W-006.
   */
  state?: {
    isOpen?: boolean;
    isLocked?: boolean;
    [k: string]: unknown;
  };
  /**
   * R-004.
   */
  states?: TransientState[];
  /**
   * R-025.
   */
  coverings?: Covering[];
  liquid?: LiquidVolume;
  /**
   * 1–5 palavras derivadas de fontes locais. R-036. Não é campo de difusão.
   */
  odorDescriptor?: string;
  /**
   * Camada gasosa da célula. R-023.
   */
  gas?: {
    materialId?: string;
    density?: number;
  };
  sectorId?: string;
  locationLabel?: string;
}
/**
 * Poça no tile. R-020, R-021.
 */
export interface LiquidVolume {
  /**
   * Material de maior volume — é ele que a percepção vê.
   */
  dominantMaterialId?: string;
  /**
   * 1 a 3 palavras quando a mistura importa: 'água com óleo'.
   */
  descriptor?: string;
  /**
   * Simulação interna; não vai cru ao prompt.
   */
  totalVolume?: number;
  /**
   * Preenchido só na carga de recipiente, onde O-031 precisa dela para que panela sobre fogo cozinhe e odre de couro isole. A poça deixa vazio porque o tile já carrega a própria temperatura por R-007, e duplicá-la ali criaria duas verdades sobre o mesmo calor.
   */
  temperatureC?: number;
  /**
   * Volumes por material, para a simulação decidir quem domina. Nunca entra em percepção nem no Validador.
   */
  components?: {
    materialId: string;
    volume: number;
  }[];
}
/**
 * Molde reutilizável de objeto. O que é constante ao tipo vive aqui; o que varia por exemplar vive em WorldObject. W-030.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ObjectDef".
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
  affordances: Affordance[];
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
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ItemRule".
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
/**
 * O que um indivíduo acha que um tipo de objeto faz. Guardado somente quando diverge da descrição funcional verdadeira: sem divergência o agente herda o entendimento correto, e o registro existir já significa que ele entende errado. É o que produz uso supersticioso, erro plausível e a correção que vem de ver a coisa falhar. O-022.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ItemBelief".
 */
export interface ItemBelief {
  defId: string;
  /**
   * 1 a 3 frases, do ponto de vista do agente.
   */
  believedFunction: string;
  confidence?: number;
  divergedAtSimTime?: number;
  /**
   * Revisada quando o agente percebe algo que contradiz a crença. O-023.
   */
  lastRevisedAtSimTime?: number | null;
}
/**
 * Exemplar de um ObjectDef no mundo. O-001.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "WorldObject".
 */
export interface WorldObject {
  id: string;
  defId: string;
  pos: Vec2;
  /**
   * Ausente significa o grid principal. W-059.
   */
  gridId?: string;
  /**
   * Altura em metros acima do solo da célula, para o objeto que repousa sobre outra coisa em vez de sobre o chão. Não guarda objeto em voo: arremesso e queda resolvem dentro do mesmo tick e assentam antes de o tick fechar, conforme O-011. W-062, W-063.
   */
  z?: number;
  rotation?: number;
  velocity?: Vec21;
  /**
   * Integridade unificada: dano estrutural + desgaste. R-027, R-028.
   */
  integrity?: number;
  /**
   * id de container, de agente que carrega, ou de célula que guarda.
   */
  containedBy?: string | null;
  contents?: string[];
  /**
   * Quantos exemplares idênticos este registro representa. Um só registro para uma pilha é o que permite sessenta e quatro flechas não custarem sessenta e quatro objetos. Limitado pelo stackLimit do molde. O-007.
   */
  stackCount?: number;
  liquidCharge?: LiquidVolume1;
  composite?: CompositeStructure;
  /**
   * R-007.
   */
  temperature?: number;
  /**
   * R-004.
   */
  states?: TransientState[];
  /**
   * R-025.
   */
  coverings?: Covering[];
  /**
   * R-036.
   */
  odorDescriptor?: string;
  state?: {
    [k: string]: unknown;
  };
}
/**
 * Metros por segundo simulado. Ausente ou zero significa parado, que é o caso da esmagadora maioria dos objetos e custa nada. Presente significa que o objeto está em trânsito balístico. Projétil é apenas um objeto com velocidade. O-010.
 */
export interface Vec21 {
  x: number;
  y: number;
}
/**
 * O que este exemplar tem dentro, limitado pelo liquidCapacity do molde. O peso da carga entra na conta de O-013 como qualquer outro peso, e é isso que faz água ser cara de carregar sem existir regra sobre água. O-029, O-030, O-031.
 */
export interface LiquidVolume1 {
  /**
   * Material de maior volume — é ele que a percepção vê.
   */
  dominantMaterialId?: string;
  /**
   * 1 a 3 palavras quando a mistura importa: 'água com óleo'.
   */
  descriptor?: string;
  /**
   * Simulação interna; não vai cru ao prompt.
   */
  totalVolume?: number;
  /**
   * Preenchido só na carga de recipiente, onde O-031 precisa dela para que panela sobre fogo cozinhe e odre de couro isole. A poça deixa vazio porque o tile já carrega a própria temperatura por R-007, e duplicá-la ali criaria duas verdades sobre o mesmo calor.
   */
  temperatureC?: number;
  /**
   * Volumes por material, para a simulação decidir quem domina. Nunca entra em percepção nem no Validador.
   */
  components?: {
    materialId: string;
    volume: number;
  }[];
}
/**
 * Presente quando o objeto é montado de outros. O-004.
 */
export interface CompositeStructure {
  /**
   * @minItems 2
   */
  componentIds: [string, string, ...string[]];
  /**
   * Grafo de conexão. Uma peça que quebra se desconecta, e o que dependia dela através dela também se solta. O-004.
   */
  connections: {
    a: string;
    b: string;
    /**
     * Quão bem o calor atravessa esta junta. Oito bits porque é a resolução que o fenômeno pede: o cabo de madeira de uma panela de ferro é o mesmo mecanismo que uma alça isolante. R-008, O-006.
     */
    thermalEfficiency: number;
  }[];
  /**
   * DERIVADO da soma dos pesos dos componentes. Nunca atribuído.
   */
  weight?: number;
}
/**
 * Objeto montado de outros objetos. A física do jogo renderiza e move um só corpo; a composição existe para que o calor caminhe pelas peças, para que quebrar uma peça desmonte o resto, e para que o peso venha de baixo em vez de ser inventado. O-004, O-005.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CompositeStructure".
 */
export interface CompositeStructure1 {
  /**
   * @minItems 2
   */
  componentIds: [string, string, ...string[]];
  /**
   * Grafo de conexão. Uma peça que quebra se desconecta, e o que dependia dela através dela também se solta. O-004.
   */
  connections: {
    a: string;
    b: string;
    /**
     * Quão bem o calor atravessa esta junta. Oito bits porque é a resolução que o fenômeno pede: o cabo de madeira de uma panela de ferro é o mesmo mecanismo que uma alça isolante. R-008, O-006.
     */
    thermalEfficiency: number;
  }[];
  /**
   * DERIVADO da soma dos pesos dos componentes. Nunca atribuído.
   */
  weight?: number;
}
/**
 * Estado biológico do agente. Quase tudo aqui é derivado de partes e condições — ver SPEC-B.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Biology".
 */
export interface Biology {
  age: number;
  /**
   * Escalares que decaem com o tempo. Cruzar o limiar crítico gera uma condição, em vez de aplicar efeito direto. B-019.
   */
  needs: {
    hunger: number;
    thirst: number;
    /**
     * Inclui conforto/fadiga — bladder fundido aqui como pressão que gera condição, não escalar separado. B-019.
     */
    energy: number;
    hygiene: number;
    social?: number;
  };
  /**
   * Graus Celsius. Participa do sistema térmico do mundo. B-018, R-007.
   */
  bodyTemperature?: number;
  /**
   * Vetor de tamanho fixo, indexado por posição conforme config/body.json. B-001, B-038.
   */
  parts: BodyPartState[];
  /**
   * Ferimento, doença, cicatriz, prótese, efeito de substância, condição crônica e estado mental — tudo aqui. B-006.
   */
  conditions: Condition[];
  capacities: Capacities;
  /**
   * Sangue, fuligem, lama. Perceptível por terceiros. R-025, B-032.
   */
  coverings?: Covering[];
  /**
   * DERIVADO de partes vitais destruídas e capacidades vitais zeradas. O GM nunca escreve aqui: para matar, destrói uma parte vital ou aplica condição fatal, e a morte vem com cadeia causal. B-029, B-036.
   */
  isAlive: boolean;
  /**
   * Preenchido na morte, com a cadeia causal registrada à parte. B-029.
   */
  causeOfDeath?: string;
}
/**
 * Estado corrente de uma parte. A definição — cobertura, vitalidade, material inicial, capacidades servidas — vive em config/body.json. B-002.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "BodyPartState".
 */
export interface BodyPartState {
  partId: string;
  /**
   * Zero destrói a parte e cascateia para os filhos. B-004.
   */
  health: number;
  /**
   * Material corrente da parte, referenciando o mesmo catálogo dos tiles. Ausente significa o material inicial declarado em config/body.json. Presente e divergente significa que a parte foi transmutada, e todas as consequências — resistência a dano, limiares térmicos, densidade, capacidade de cicatrizar — passam a vir daqui. B-003, B-038, B-039.
   */
  materialId?: string;
  destroyed?: boolean;
  /**
   * Destruída e removida, distinto de apenas ferida.
   */
  missing?: boolean;
  /**
   * Substituição artificial, com eficiência própria. B-005.
   */
  prostheticId?: string;
  /**
   * Idade biológica desta parte, em anos, independente da idade do agente. Um fígado pode envelhecer mais rápido que o dono. Quanto maior, mais comprometida a função, com velocidade e forma do comprometimento declaradas por classe de parte em config/body.json. B-058.
   */
  biologicalAge?: number;
  /**
   * Carga tóxica acumulada nesta parte. Sobe por taxa própria do tipo de parte e desce pelo trabalho do sistema excretor. Com tudo funcionando fica perto de zero; quando a excreção falha, sobe em toda parte ao mesmo tempo e a falência é sistêmica em vez de local. É a mesma corrida assimétrica da infecção, aplicada ao corpo inteiro. B-059, B-060.
   */
  toxicity?: number;
  /**
   * DERIVADO. Quanto esta parte ainda entrega do que deveria. Vem da integridade transformada linearmente entre dois pontos declarados por tipo de parte: acima da sensibilidade vale 1, abaixo da resiliência vale 0, e entre as duas interpola. Modulado ainda por idade biológica e toxicidade. Alimenta as capacidades de B-012. B-055.
   */
  functioning?: number;
  /**
   * Coberturas localizadas nesta parte. Distinto de Biology.coverings, que descreve o corpo inteiro. É o que separa 'sangue na mão' de 'coberto de sangue' — a primeira é a evidência que incrimina, a segunda é o estado que assusta. Quando a parte é decepada, suas coberturas acompanham o membro. R-025, B-032.
   */
  coverings?: Covering[];
  /**
   * DERIVADO das peças de vestuário que cobrem esta parte. Falso significa que há tecido entre a parte e o mundo, e as reações de contato do substrato incidem sobre a roupa antes da carne. É o que faz vestir um casaco importar sem simular camadas de tecido. R-025, B-021.
   */
  exposedSkin?: boolean;
}
/**
 * A unidade única de saúde. B-006, B-007.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Condition".
 */
export interface Condition {
  /**
   * Entrada em config/conditions.json.
   */
  defId: string;
  /**
   * Ausente significa condição de corpo inteiro.
   */
  partId?: string;
  severity: number;
  /**
   * DERIVADO da severidade pelos limiares declarados. V-013 nomeia estágio de condição entre os campos que o Validador nunca escreve, e a marcação estava só na prosa: o guarda de mutação lê a marca, não a descrição. B-008.
   */
  stage?: number;
  /**
   * Só em condições que correm contra imunidade. A primeira das duas a chegar a 1 vence. B-024.
   */
  immunity?: number;
  /**
   * Contribuição para a perda de sangue. B-017.
   */
  bleedRate?: number;
  /**
   * Qualidade do último tratamento. B-025.
   */
  tendQuality?: number;
  tendedAtTick?: number;
  onsetTick?: number;
  /**
   * Cicatriz, prótese, membro faltando. Cadência estática, custo zero. B-010, B-023.
   */
  permanent?: boolean;
  /**
   * Quem ou o que causou. Alimenta o log causal e a atribuição social. R-048.
   */
  sourceId?: string;
}
/**
 * TODAS DERIVADAS. Nunca atribuídas diretamente, nem pela engine nem pelo GM. Recalculadas por invalidação, quando o conjunto de partes vivas e condições ativas muda — nunca a cada tick. Uma mutação do GM que aponte para cá é rejeitada pelo validador, que sugere qual condição produz o efeito pretendido. B-012, B-015, B-036.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Capacities".
 */
export interface Capacities {
  /**
   * Soma das dores das condições, modulada pelo limiar de dor da personalidade. B-016.
   */
  pain?: number;
  /**
   * Multiplicador global. Depende de cérebro, bombeamento, respiração, filtragem e dor. Abaixo do limiar de desmaio o agente cai; em zero, morre. Seleciona o tier de LLM. B-013, B-014.
   */
  consciousness: number;
  sight?: number;
  hearing?: number;
  moving: number;
  manipulation: number;
  talking?: number;
  /**
   * Derivada de nariz e condições. B-012.
   */
  smell?: number;
  /**
   * Derivada de mandíbula e condições. B-012.
   */
  eating?: number;
  /**
   * Vital.
   */
  breathing?: number;
  /**
   * Vital.
   */
  bloodPumping?: number;
  /**
   * Vital. Governa a velocidade de ganho de imunidade. B-024.
   */
  bloodFiltration?: number;
  /**
   * Vital.
   */
  digestion?: number;
  metabolism?: number;
}
/**
 * A-020. Traços numéricos guiam mecânica; o texto guia tom.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Personality".
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
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Skills".
 */
export interface Skills {
  [k: string]: number;
}
/**
 * C-022.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Opinion".
 */
export interface Opinion {
  id: string;
  kind: 'general' | 'social';
  /**
   * Conceito ou id de agente.
   */
  targetId: string;
  targetLabel?: string;
  /**
   * Viés relacional comprimido. Pré-filtro por topic.
   */
  stance?:
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
   * Tópico canônico para pré-filtro de dissonância.
   */
  topic?: string;
  /**
   * 1 a 3 frases ATEMPORAIS. C-024.
   */
  nuanceDescription: string;
  dissonanceBuffer: {
    text: string;
    intensity: number;
    simTime: number;
  }[];
  /**
   * Valor base, derivado da personalidade.
   */
  stubbornnessThreshold: number;
  /**
   * Base mais acréscimos por sinergia. C-028.
   */
  currentThreshold: number;
  lastBurstSimTime?: number | null;
  /**
   * Identificadores das opiniões que esta consolidou. Só presente na sobrevivente de uma consolidação. C-032.
   */
  absorbedIds?: string[];
  /**
   * Presente na opinião absorvida, apontando para a consolidada. Consultar o identificador de uma absorvida resolve para a sobrevivente por este campo — nada é apagado, e por isso uma memória antiga que cite a opinião antiga continua resolvendo. C-032.
   */
  supersededById?: string | null;
  /**
   * Verdadeiro em opinião absorvida. Arquivada não entra em contexto de pensamento nem recebe dissonância, mas permanece no estado e continua resolvível. C-032.
   */
  archived?: boolean;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "MemoryEntry".
 */
export interface MemoryEntry {
  id: string;
  layer: 'short_term' | 'daily' | 'seasonal' | 'annual' | 'quinquennial' | 'decadal' | 'era';
  text: string;
  /**
   * Quando o período coberto começou.
   */
  simTime: number;
  /**
   * Sobe intacto pelas camadas. C-013.
   */
  isMarcante?: boolean;
  /**
   * A nota que o agente deu ao instante quando o viveu, preservada junto da memória que ela elegeu. Sem ela a eleição determinística de C-014 acontece mas não é auditável depois: seria impossível dizer se uma lembrança sobreviveu por ter marcado ou por um limiar mal calibrado naquele dia. C-053, C-052.
   */
  memorabilityScore?: number;
  /**
   * Ex: validator_denial, action_blocked, trauma.
   */
  tags?: string[];
  userCreated?: boolean;
  /**
   * Só em camadas longas: parágrafos focados em relações.
   */
  social?: string;
}
/**
 * O que o indivíduo tem por fato do mundo. Distinto de memória, que é o que ele viveu, e de opinião, que é o que ele acha. Um fato aqui pode ser falso: o que importa é que ele acredita. Alimentado pelo Crivo. C-048.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "FactBankEntry".
 */
export interface FactBankEntry {
  id: string;
  /**
   * Uma frase, afirmativa.
   */
  text: string;
  /**
   * Tópico canônico, para recuperação e pré-filtro.
   */
  topic?: string;
  verdict: SieveVerdict;
  /**
   * De quem ouviu. Nulo quando veio de percepção direta.
   */
  sourceAgentId?: string | null;
  confidence?: number;
  /**
   * Quantas fontes independentes disseram o mesmo. É o que promove um 'possible' a 'true' sem nova chamada. C-049.
   */
  corroborationCount?: number;
  /**
   * Fato que colide com este. Colisão alimenta dissonância pelo caminho normal de C-025.
   */
  contradictedByFactId?: string | null;
  simTime: number;
}
/**
 * Uma quantidade de líquido, comprimida em dominante mais descritor. É a mesma forma na poça do tile (R-020, R-021) e na carga de um recipiente (O-029), e é um `$def` único de propósito: encher e verter não traduzem entre dois formatos, então não há como perder informação no caminho — não há caminho. Se dosagem vier a importar, muda-se aqui e os dois lugares mudam juntos.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "LiquidVolume".
 */
export interface LiquidVolume2 {
  /**
   * Material de maior volume — é ele que a percepção vê.
   */
  dominantMaterialId?: string;
  /**
   * 1 a 3 palavras quando a mistura importa: 'água com óleo'.
   */
  descriptor?: string;
  /**
   * Simulação interna; não vai cru ao prompt.
   */
  totalVolume?: number;
  /**
   * Preenchido só na carga de recipiente, onde O-031 precisa dela para que panela sobre fogo cozinhe e odre de couro isole. A poça deixa vazio porque o tile já carrega a própria temperatura por R-007, e duplicá-la ali criaria duas verdades sobre o mesmo calor.
   */
  temperatureC?: number;
  /**
   * Volumes por material, para a simulação decidir quem domina. Nunca entra em percepção nem no Validador.
   */
  components?: {
    materialId: string;
    volume: number;
  }[];
}
/**
 * Como o indivíduo se vê e como acha que deve responder a cada tipo de situação. Gerado esporadicamente a partir das memórias recentes, da personalidade e dos auto-entendimentos anteriores — e por isso deriva junto com o personagem em vez de ser fixo. É a única peça do desenho que dá ao agente uma teoria sobre si mesmo. C-050.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SelfUnderstanding".
 */
export interface SelfUnderstanding {
  /**
   * Prosa curta em primeira pessoa. Teto de palavras em tuning.
   */
  text: string;
  generatedAtSimTime: number;
  /**
   * O auto-entendimento anterior, preservado por uma geração. Comparar os dois é o que torna a deriva de caráter legível na UI e no export narrativo.
   */
  supersedesText?: string;
  basedOnMemoryIds?: string[];
}
/**
 * C-010. Privado. Fonte da verdade contra a qual mentiras são comparadas.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ActivityLogEntry".
 */
export interface ActivityLogEntry {
  simTime: number;
  action: string;
  targetId?: string | null;
  /**
   * Base da corroboração cruzada. C-020.
   */
  sectorId: string;
  verdict?: 'executed' | 'partial' | 'reinterpreted' | 'denied';
  outcome?: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Goal".
 */
export interface Goal {
  level: 'primary' | 'secondary' | 'tertiary' | 'whim';
  text: string;
  rationale?: string;
  setAtSimTime?: number;
  /**
   * Usado por caprichos.
   */
  expiresAtSimTime?: number | null;
  userCreated?: boolean;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "InventorySlot".
 */
export interface InventorySlot {
  slot: 'hand_left' | 'hand_right' | 'worn' | 'backpack';
  objectIds?: string[];
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Relationship".
 */
export interface Relationship {
  targetId: string;
  sentiment: number;
  /**
   * Ex: irmão, cônjuge, rival, colega.
   */
  kind?: string;
  /**
   * Aponta para a opinião social textual correspondente.
   */
  opinionId?: string | null;
}
/**
 * A-020. Sempre acessível ao contexto de pensamento.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Routine".
 */
export interface Routine {
  wakeHour?: number;
  sleepHour?: number;
  workStartHour?: number;
  workEndHour?: number;
  /**
   * Função na comunidade. A-021.
   */
  role?: string;
  assignedTasks?: string[];
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Agent".
 */
export interface Agent {
  id: string;
  name: string;
  appearanceDescription?: string;
  pos: Vec22;
  /**
   * Graus. Independente da direção de movimento.
   */
  rotation: number;
  /**
   * Tiles por minuto simulado.
   */
  moveSpeed?: number;
  vision?: {
    /**
     * Graus de abertura do cone.
     */
    angle?: number;
    /**
     * Tiles.
     */
    range?: number;
  };
  hearingRange?: number;
  biology: Biology;
  personality: Personality;
  skills: Skills;
  inventory?: InventorySlot[];
  relationships?: Relationship[];
  opinions?: Opinion[];
  memories?: MemoryEntry[];
  /**
   * O que o agente tem por verdade sobre o mundo, incluindo o que ele registrou como mentira ouvida. C-048.
   */
  factBank?: FactBankEntry[];
  selfUnderstanding?: SelfUnderstanding;
  voiceCard?: VoiceCard;
  /**
   * Somente as divergências: um item ausente daqui é um item que o agente entende corretamente. O-022.
   */
  itemBeliefs?: ItemBelief[];
  /**
   * Deliberação profunda é escolha do agente, limitada por período de vários dias e dimensionada pela inteligência. Distinto do teto de chamadas, que limita volume: este limita acesso ao modelo forte. C-051.
   */
  deepThinkingBudget?: {
    /**
     * Zero significa que a opção não é oferecida.
     */
    total?: number;
    used?: number;
    windowStartSimTime?: number;
  };
  activityLog?: ActivityLogEntry[];
  goals?: {
    primary?: Goal;
    secondary?: Goal;
    tertiary?: Goal;
    whim?: Goal1;
    /**
     * Metas abandonadas, da mais recente para a mais antiga, truncadas pelo teto declarado em tuning. Lista e não slot único porque C-038 promete que a ambição frustrada continua disponível como frustração: com um slot, o ferreiro que perde a mão e depois perde o filho esquece a mão. C-038.
     */
    deprecated?: Goal[];
  };
  routine?: Routine;
  currentThought?: string | null;
  /**
   * Estados transitórios sobre o próprio agente — em chamas, molhado, eletrificado. Mesma estrutura de tile e objeto, e é o que permite ao substrato reativo tratar uma criatura como qualquer outra entidade ocupando uma célula. R-004, R-034.
   */
  states?: TransientState[];
  /**
   * 1–5 palavras derivadas de coberturas, condições e higiene. Perceptível por quem tem olfato. R-036.
   */
  odorDescriptor?: string;
  flags?: (
    | 'sleeping'
    | 'resting'
    | 'thinking'
    | 'in_conversation'
    | 'combat'
    | 'unconscious'
    | 'dead'
    | 'paused'
  )[];
  llmBudgetUsedToday?: number;
  /**
   * Consumo do orçamento de lote, contabilizado à parte do teto de pensamento e conversa. Separado porque o lote noturno é o que preserva o estado que faz o agente existir amanhã: se disputasse o mesmo teto, o agente que passou o dia conversando perderia a memória do dia. C-007, L-006.
   */
  llmBatchBudgetUsedToday?: number;
  /**
   * Hora simulada em que o agente entrou em degradação por esgotamento de orçamento; nulo quando opera normalmente. Zerado na virada do dia simulado. É o que a UI lê para marcar o agente. C-007, L-006, U-020.
   */
  degradedSinceSimTime?: number | null;
}
/**
 * Contínua, não travada ao grid. W-002.
 */
export interface Vec22 {
  x: number;
  y: number;
}
export interface Goal1 {
  level: 'primary' | 'secondary' | 'tertiary' | 'whim';
  text: string;
  rationale?: string;
  setAtSimTime?: number;
  /**
   * Usado por caprichos.
   */
  expiresAtSimTime?: number | null;
  userCreated?: boolean;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CommunityLaw".
 */
export interface CommunityLaw {
  id: string;
  text: string;
  enactedAtSimTime?: number;
  sourceMeetingId?: string;
}
/**
 * V-005. Alteração concreta emitida pelo GM.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "WorldMutation".
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
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Clock".
 */
export interface Clock {
  /**
   * Minutos simulados desde o início.
   */
  simTime: number;
  /**
   * Multiplicador de velocidade. O conjunto de valores oferecidos é declarado em config/tuning.json sob tempo.velocidadesDisponiveis, e não enumerado aqui: fixar a lista no schema criaria uma terceira fonte de verdade sobre um número ajustável. Zero é pausa. W-041, U-003, X-008.
   */
  speed: number;
  paused: boolean;
  day?: number;
  season?: number;
  year?: number;
}
/**
 * Uma conversa em curso ou encerrada. Estado compartilhado entre os participantes, e não cópia por agente, porque orçamento de turno e proposta de realocação precisam de um só lugar de verdade. S-001.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ConversationInstance".
 */
export interface ConversationInstance {
  id: string;
  /**
   * Quem propôs o handshake. S-002.
   */
  initiatorId?: string;
  /**
   * Ids de agente, na ordem de entrada. Cresce e encolhe durante a conversa. S-015.
   *
   * @minItems 2
   */
  participants: [string, string, ...string[]];
  /**
   * pending é handshake proposto e não respondido.
   */
  state: 'pending' | 'active' | 'relocating' | 'ended';
  /**
   * Onde a conversa acontece. Muda em realocação aceita. S-010.
   */
  locationLabel?: string;
  /**
   * Teto de turnos, derivado na abertura da habilidade social dos participantes e do assunto. S-006.
   */
  maxTurns?: number;
  turnCount?: number;
  /**
   * S-007.
   */
  extensionsUsed?: number;
  /**
   * Proposta de mudança de lugar aguardando voto. S-010.
   */
  pendingRelocation?: {
    proposerId?: string;
    targetLabel?: string;
    /**
     * Id de agente para aceite.
     */
    votes?: {
      [k: string]: boolean;
    };
  } | null;
  /**
   * Assunto que ficou em aberto e eleva a propensão de reabrir. S-011.
   */
  unresolvedTopic?: string | null;
  startedAtSimTime: number;
  endedAtSimTime?: number | null;
  /**
   * S-008. budgetExhausted cobre o caso em que a reserva de orçamento de conversa acaba antes do teto de turnos.
   */
  endReason?: 'turnBudget' | 'mutualClose' | 'departure' | 'hardBlocker' | 'budgetExhausted';
}
/**
 * Uma coisa que os sentidos alcançaram, já em prosa e ainda não fundida no relato. É o passo intermediário de A-031: a engine colhe fatos, ordena por saliência (A-032) e corta no orçamento antes de montar o texto que vai ao prompt. Existir como tipo é o que torna o corte auditável e reproduzível — ordenar prosa já montada seria ordenar parágrafo, e o corte deixaria de ser inspecionável.
 *
 * Não é impressão. `RawImpression` é o que o agente *concluiu* e carrega para a dissonância; isto aqui é o que estava lá para ser visto, e some assim que o relato é montado. O que decide se um fato vira impressão é o limiar de lembrabilidade (C-052).
 *
 * O campo `sourceId` é a única coisa aqui que nunca pode ser renderizada: A-033 proíbe identificador interno no relato, e ele existe só para a engine casar o fato com a entidade em passos posteriores.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "PerceptibleFact".
 */
export interface PerceptibleFact {
  /**
   * Uma frase, do ponto de vista de quem percebe, sem número cru e sem identificador. A-033.
   */
  text: string;
  /**
   * A ordem declarada em A-032: 1 perigo imediato, 2 pessoas, 3 mudança, 4 objeto com affordance útil, 5 ambiente contínuo, 6 cenário de fundo. O corte por orçamento come de 6 para 1.
   */
  salienceTier: number;
  /**
   * Qual sentido alcançou. Decide o que a oclusão e a escuridão apagam: parede tira a visão e deixa o som (A-007, A-009).
   */
  sense: 'sight' | 'hearing' | 'smell' | 'touch' | 'taste' | 'proprioception';
  /**
   * Que espécie de coisa o fato descreve. Serve ao agrupamento na montagem — pessoas juntas, ambiente junto — e não vai ao prompt.
   */
  subjectKind?: 'agent' | 'object' | 'tile' | 'field' | 'weather' | 'self';
  /**
   * Identificador interno da entidade. NUNCA renderizado: A-033 proíbe identificador no relato. Existe para a engine casar o fato com a entidade depois.
   */
  sourceId?: string | null;
  /**
   * O fato é novidade desde a última percepção deste agente. É o que sustenta a camada 3 de A-032 e o que distingue 'a lareira está acesa' de 'a lareira acabou de apagar'.
   */
  isChange?: boolean;
}
/**
 * Fato interpretado que o agente carrega antes de virar — ou não — dissonância. Produzido por pós-conversa, por reflexão noturna e por percepção saliente. Tem identificador próprio porque C-029 promete que é auditável qual impressão rompeu qual opinião, e o buffer precisa poder apontar de volta. C-011, C-025.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "RawImpression".
 */
export interface RawImpression {
  id: string;
  /**
   * Uma frase, do ponto de vista do agente.
   */
  text: string;
  /**
   * Alvo, quando a impressão é sobre alguém. S-013.
   */
  aboutAgentId?: string | null;
  /**
   * Tópico canônico, para o pré-filtro de dissonância. C-030.
   */
  topic?: string | null;
  intensity?: number;
  simTime: number;
  /**
   * De onde veio. denial é tentativa frustrada pelo GM. C-046.
   */
  sourceType?: 'conversation' | 'perception' | 'reflection' | 'denial';
  /**
   * Já passou pelo classificador em lote. C-025.
   */
  classified?: boolean;
}
/**
 * Causação nova que o GM julgou generalizável, promovida a regra determinística. Entra viva — o ciclo de vida existe para revisão humana, não para autorização prévia, porque a economia inteira do mecanismo vem de a próxima ocorrência não custar chamada. V-024, V-027.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ProvisionalRule".
 */
export interface ProvisionalRule {
  id: string;
  /**
   * V-022. Cada domínio tem vocabulário fechado próprio de condição e efeito. O domínio `object` materializa a regra como `ItemRule` no Funcionamento do `ObjectDef` alvo, mas continua registrada aqui: registro único é o que faz o teto de regras vivas de V-027 e o painel de ciclo de vida valerem também para as regras de objeto. V-041, O-021.
   */
  domain: 'substrate' | 'body' | 'social' | 'cognition' | 'community' | 'object';
  /**
   * Provisória vale desde já. Permanente sempre vence provisória em colisão. Rejeitada permanece registrada para não ser reproposta. V-025, V-027.
   */
  state: 'provisional' | 'permanent' | 'rejected';
  /**
   * Corpo da regra, no vocabulário fechado do domínio. Validado contra o catálogo do domínio: uma regra fora do vocabulário é rejeitada na entrada e o julgamento vira caso único. V-021, V-022.
   */
  rule: {
    condition: {
      [k: string]: unknown;
    };
    effect?: {
      [k: string]: unknown;
    };
    formula?: FormulaBinding;
    /**
     * Uma frase legível, para o painel. U-022.
     */
    description?: string;
  };
  /**
   * Quantas vezes disparou. Alimenta a detecção de disparo anômalo e o painel. V-028, U-022.
   */
  fireCount?: number;
  proposedAtSimTime: number;
  /**
   * Julgamento do GM que a originou, para auditoria. V-024, X-005.
   */
  sourceJudgmentId?: string;
  /**
   * Por que o GM julgou que generaliza.
   */
  reasoning?: string;
  /**
   * Quando virou permanente ou foi rejeitada.
   */
  resolvedAtSimTime?: number | null;
}
/**
 * Alternativa a effect, para causação que é essencialmente numérica. Problema numérico não cabe em condição-para-efeito discreto, e é justamente onde o VALIDADOR era rechamado para sempre. V-040.
 */
export interface FormulaBinding {
  /**
   * Entrada do catálogo de moldes em config/formulas.json.
   */
  templateId: string;
  /**
   * Constantes que o molde declara. Um parâmetro fora do que o molde declara invalida a regra.
   */
  parameters: {
    [k: string]: number;
  };
  /**
   * De onde vem cada variável do molde: caminho para grandeza do mundo, como massa do objeto ou velocidade relativa. Vocabulário fechado.
   */
  inputs?: {
    [k: string]: string;
  };
  /**
   * O que o resultado do cálculo vira.
   */
  output: {
    kind: 'damage' | 'probability' | 'integrity' | 'temperature' | 'displacement' | 'duration';
    damageType?: DamageType;
    clampMin?: number;
    clampMax?: number;
  };
}
/**
 * Objetivo coletivo saído de assembleia. Vive no estado do mundo, não no do agente, porque pertence à comunidade e sobrevive à morte de qualquer participante. Entra no contexto de revisão de meta individual como pressão, nunca como imposição. S-028.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CommunityGoal".
 */
export interface CommunityGoal {
  id: string;
  text: string;
  rationale?: string;
  sourceMeetingId?: string;
  setAtSimTime?: number;
  status: 'active' | 'achieved' | 'abandoned';
  /**
   * Quem adotou o objetivo em meta própria. Quem não está aqui não é dissidente por omissão. S-029.
   */
  committedAgentIds?: string[];
}
/**
 * Uma simulação numérica generalizável, expressa como escolha de molde mais parâmetros. O VALIDADOR não escreve código: ele escolhe entre moldes declarados em config e preenche as constantes. É o que torna a promoção numérica auditável, determinística e impossível de malformar — modelo escrevendo expressão arbitrária que passa a rodar na engine não teria nenhuma das três propriedades. V-040.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "FormulaBinding".
 */
export interface FormulaBinding1 {
  /**
   * Entrada do catálogo de moldes em config/formulas.json.
   */
  templateId: string;
  /**
   * Constantes que o molde declara. Um parâmetro fora do que o molde declara invalida a regra.
   */
  parameters: {
    [k: string]: number;
  };
  /**
   * De onde vem cada variável do molde: caminho para grandeza do mundo, como massa do objeto ou velocidade relativa. Vocabulário fechado.
   */
  inputs?: {
    [k: string]: string;
  };
  /**
   * O que o resultado do cálculo vira.
   */
  output: {
    kind: 'damage' | 'probability' | 'integrity' | 'temperature' | 'displacement' | 'duration';
    damageType?: DamageType;
    clampMin?: number;
    clampMax?: number;
  };
}
/**
 * Onde o VALIDADOR barra e onde ele apenas calcula consequência. Fora dos domínios de porteiro a postura permissiva de V-003 vale integralmente: a ação acontece e o que o modelo produz são desfechos com probabilidade. Dentro deles a ação pode ser barrada e o pedido volta ao agente com explicação. Declarado por cenário. V-035, V-036.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ValidationPolicy".
 */
export interface ValidationPolicy {
  /**
   * Domínios em que negar é resultado legítimo e o agente é convidado a tentar de novo. Lista vazia significa VALIDADOR puramente consequencial.
   */
  gatekeeperDomains: (
    | 'physicalLaw'
    | 'inviolableLaw'
    | 'userProhibition'
    | 'bodyIntegrity'
    | 'socialNorm'
    | 'resourceConservation'
  )[];
  /**
   * Tentativas adicionais após uma negação em domínio de porteiro. Só conta dentro desses domínios: negação fora deles é final e diegética, sem rechamada. V-036.
   */
  maxRetries?: number;
  notes?: string;
}
/**
 * O que é fisicamente possível neste cenário. Declarado na geração e imutável em jogo. É o contrato que permite ao GM ser permissivo sem que a simulação vire fantasia: num cenário realista, transmutar um fêmur em gelo não está no registro e o pedido é reinterpretado. B-044, V-016.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "PlausibilityRegistry".
 */
export interface PlausibilityRegistry {
  /**
   * Identificadores do vocabulário de efeito de R-015 e B-037 admitidos neste cenário. Uma operação fora desta lista é recusada pela engine antes de mutar qualquer coisa. R-043, B-037.
   */
  allowedOperations: string[];
  /**
   * Exceções explícitas, para cenários que permitem uma família de efeitos menos um caso.
   */
  forbiddenOperations?: string[];
  /**
   * Frases curtas enviadas ao GM no contexto. Ex.: 'ninguém voa', 'não há magia'. Produzido pela geração de cenário. V-016.
   */
  inviolableLaws: string[];
  notes?: string;
}
/**
 * Uma linha do log causal: um efeito e a causa que o produziu. X-005. É a memória do mundo, e é por ela existir que não há resumo em prosa do Validador. Tem janela de retenção declarada: o que sai dela é descartado sem condensar, porque semente e cassete regeneram o trecho. X-017.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CausalEntry".
 */
export interface CausalEntry {
  simTime: number;
  cause: {
    /**
     * As quatro origens de X-005, abertas nas formas que a engine distingue. 'time' cobre o que decai ou converge sozinho por passagem de tick.
     */
    kind:
      | 'matrix_rule'
      | 'injury_matrix'
      | 'provisional_rule'
      | 'validator'
      | 'agent_decision'
      | 'engine_effect'
      | 'time';
    /**
     * Identificador da regra, do efeito ou da decisão. É o que permite ir do estado ao motivo sem busca textual.
     */
    ref?: string;
    /**
     * Agente responsável, quando houve um.
     */
    actorId?: string;
  };
  /**
   * O que mudou, em vocabulário fechado da engine. Não é prosa: prosa aqui viraria um segundo canal narrativo concorrendo com a percepção.
   */
  effect: string;
  targetKind: 'tile' | 'object' | 'agent' | 'body_part' | 'world';
  targetId: string;
  gridId?: string;
  pos?: GridPos;
}
/**
 * Posição de um fluxo nomeado de aleatoriedade no momento do save. X-004, X-003. Sem isto, carregar e continuar reinicia cada fluxo do começo e a partida retomada sorteia de novo o que já tinha sorteado — o save preservaria o estado e perderia o futuro.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "RngCursor".
 */
export interface RngCursor {
  stream: string;
  /**
   * Estado interno do gerador, restaurado tal e qual. Inteiro de 32 bits sem sinal.
   */
  state: number;
  /**
   * Quantos números já saíram deste fluxo. Diagnóstico: não é usado para restaurar.
   */
  draws?: number;
}
/**
 * As três camadas que toda célula sempre tem — tipo, material e altura do solo — guardadas densamente e codificadas por repetição no save. W-058. Densa porque não há célula sem elas, e codificada por repetição porque um grid 512×512 recém-gerado é quase todo a mesma coisa: o que ocupa 262 mil posições em memória cabe em algumas dezenas de números em disco, sem perda.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "GridTileLayers".
 */
export interface GridTileLayers {
  gridId: string;
  width: number;
  height: number;
  /**
   * Valores distintos presentes no grid. As camadas guardam o índice, não a string.
   */
  typePalette: TileType[];
  /**
   * Identificadores de material distintos presentes no grid.
   */
  materialPalette: string[];
  typeRuns: RunLengthRuns;
  materialRuns: RunLengthRuns;
  baseHeightRuns: RunLengthRuns1;
}
/**
 * O que só algumas células têm, indexado pela célula afetada. W-058. Estados transientes, coberturas, líquido, gás, ocupação e guardado vivem aqui e não em matriz densa, para que a memória cresça com o que aconteceu e não com a área do mapa. Uma célula ausente daqui é uma célula intacta, e é isso que faz um grid 512×512 recém-gerado não custar quase nada.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "TileOverlay".
 */
export interface TileOverlay {
  tileHeight?: number;
  pressure?: number;
  gravityMultiplier?: number;
  temperature?: number;
  integrity?: number;
  /**
   * Oxigênio local da célula (0–100). Ausente = ambiente cheio. V1 mínimo: fogo consome, fumaça correlaciona; sem difusão de gás (R-023 fica em V2).
   */
  oxygen?: number;
  rotation?: 0 | 90 | 180 | 270;
  state?: {
    [k: string]: unknown;
  };
  states?: TransientState[];
  coverings?: Covering[];
  liquid?: LiquidVolume2;
  gas?: {
    materialId?: string;
    density?: number;
  };
  occupancy?: {
    fraction?: number;
    occupantIds?: string[];
  };
  storedObjectIds?: string[];
  sectorId?: string;
  locationLabel?: string;
}
/**
 * O que é preciso saber para reproduzir a partida, e não faz parte do estado dela. X-002, X-003.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SaveManifest".
 */
export interface SaveManifest {
  /**
   * Semente-mestra como texto, e não número: uma semente escrita pelo usuário é o caso comum, e converter na entrada perderia o que ele digitou. X-004.
   */
  seed: string;
  /**
   * Preset de modelos ativo quando a partida rodou. L-005.
   */
  preset: string;
  /**
   * Impressão digital do conjunto de prompts. Prompt editado invalida cassete (L-015), e sem registrar isto o replay divergiria calado.
   */
  promptsVersion: string;
  engineVersion: string;
  /**
   * Impressão digital dos arquivos de configuração. O save guarda identificadores de material, condição e definição de objeto, mas não o catálogo — que vive em config (X-008). Se o catálogo mudou entre salvar e carregar, um identificador pode não resolver mais, e é melhor avisar na carga do que descobrir num tick qualquer.
   */
  configFingerprint?: string;
  createdAtRealTime?: string;
  savedAtSimTime?: number;
  scenarioName?: string;
}
/**
 * A raiz. Tudo que a simulação sabe está aqui dentro, e o save é este objeto serializado sem projeção nenhuma. X-003, X-001.
 *
 * Salvar por projeção — montar um objeto de save a partir do estado vivo — parece mais limpo e é a origem do defeito clássico: acrescenta-se um campo ao estado, esquece-se de acrescentá-lo à projeção, e a perda só aparece dias depois, num carregamento, sem erro. Estado que já é a forma salva não tem como esquecer.
 *
 * O que vive em configuração não vive aqui: materiais, reações, condições, plano de corpo e definições de objeto são referenciados por identificador e carregados de config (X-008). O save guarda a partida, não o jogo.
 *
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SimulationState".
 */
export interface SimulationState {
  /**
   * Versão do formato. Carregar versão incompatível recusa com mensagem, nunca carrega pela metade. X-015.
   */
  saveVersion: number;
  manifest: SaveManifest;
  clock: Clock;
  grids: Grid[];
  tileLayers: GridTileLayers[];
  /**
   * Por grid, as células que têm algo além das camadas densas. A chave interna é "x,y".
   */
  tileOverlays: {
    [k: string]: {
      [k: string]: TileOverlay;
    };
  };
  objects: {
    [k: string]: WorldObject;
  };
  composites?: {
    [k: string]: CompositeStructure1;
  };
  agents: {
    [k: string]: Agent;
  };
  conversations?: {
    [k: string]: ConversationInstance;
  };
  laws?: CommunityLaw[];
  communityGoals?: CommunityGoal[];
  provisionalRules?: ProvisionalRule[];
  formulaBindings?: FormulaBinding1[];
  plausibility?: PlausibilityRegistry;
  validationPolicy?: ValidationPolicy;
  causalLog?: CausalEntry[];
  rngCursors: RngCursor[];
  /**
   * Contador por prefixo de identificador. Precisa ser salvo: sem ele, a partida retomada recomeça a numerar do zero e passa a criar objetos com identificador que já existe — colisão que não dá erro, apenas sobrescreve.
   */
  nextIds: {
    [k: string]: number;
  };
}
