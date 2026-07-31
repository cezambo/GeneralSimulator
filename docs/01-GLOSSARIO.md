# Glossário Canônico

Termos com significado fixo no projeto. Prompt, especificação, código e UI usam **estes** nomes. O identificador de código está em `mono`.

Onde o documento original usava dois nomes para a mesma coisa, ou o mesmo nome para duas, a resolução está marcada com **⚑**.

---

## Mundo

| Termo | Código | Significado |
|-------|--------|-------------|
| **Tile** | `Tile` | Célula do grid. Tem tipo, material, estado e posição discreta. |
| **Tipo de tile** | `TileType` | `floor`, `wall`, `door`, `window`, `roof`, `water`, `road`. |
| **Material** | `Material` | Substância de que um tile, objeto **ou parte de corpo** é feito. Carrega propriedades herdadas. ⚑ catálogo **único**: pele, músculo e osso são entradas ao lado de carvalho e ferro, e não uma tabela de tecidos à parte. |
| **Propriedade herdada** | `MaterialProperty` | Vem do material, presente em tudo feito dele. Ex: inflamável. |
| **Propriedade adicional** | `TileBehavior` | Vem do tipo de tile, pode ou não existir. Ex: porta abre e fecha. |
| **Objeto** | `WorldObject` | Item ou móvel instanciado no mundo. |
| **Definição de objeto** | `ObjectDef` | Molde reutilizável do qual objetos são instanciados. |
| **Affordance** | `Affordance` | Ação que um objeto ou tile declara suportar. Ex: `sentar`, `abrir`, `golpear`. |
| **Blueprint** | `Blueprint` | Conjunto pré-montado de tiles e objetos. Ex: casa pequena. |
| **Setor** | `Sector` | Subdivisão nomeada do mapa. Base da corroboração de relatos: dois agentes no mesmo setor no mesmo horário se viram. |
| **Rótulo de local** | `LocationLabel` | Nome diegético de uma região. Ex: "Casa de Val". Usado em fala e realocação. |
| **Mundo** | `World` | Estado completo: grid, objetos, agentes, relógio. |

## Substrato

A engine física, química e fisiológica que roda sozinha, sem LLM. Detalhe em [SPEC-R](spec/SPEC-R-substrato.md) e [SPEC-B](spec/SPEC-B-corpo.md).

| Termo | Código | Significado |
|-------|--------|-------------|
| **Substrato** | — | O conjunto de sistemas que produz consequência sem consultar modelo. Mundo e corpo são o mesmo substrato em topologias diferentes. |
| **Elemento** | — | Condição instável que ocupa um tile ou objeto: fogo, água, gelo, eletricidade. Oposto de material, que é matéria estável. A matriz nunca admite material alterando material. |
| **Etiqueta** | `tag` | Unidade de classe. Toda regra do substrato referencia etiqueta, **nunca** identificador de material. |
| **Estado transiente** | `TransientState` | Condição temporária sobre uma entidade, com intensidade e duração. Vários coexistem. |
| **Campo calculado** | — | Recomputado a cada tick sem memória: luz, som, odor. Distinto de estado, que persiste. |
| **Cobertura** | `Covering` | Substância que reveste uma entidade: sangue, fuligem, lama. Perceptível por terceiros. |
| **Matriz de reação** | — | As regras de reescrita que a engine avalia sozinha, em `config/reactions.json`. |
| **Efeito nomeado** | `effectId` | Transição de estado do vocabulário fechado, invocável por identificador tanto pela matriz quanto pelo GM. |
| **Transmutação** | `transmute` | Trocar o material de um alvo preservando identidade e estado. Vale para tile, objeto e parte de corpo. |
| **Causação nova** | — | Método plausível de criar um estado que nenhuma regra modela. É a **única** coisa que o GM faz no substrato. |
| **Dívida de matriz** | — | Método improvisado que o GM repete com frequência, candidato a virar regra determinística. |
| **Promoção generalizada** | `generalization` | Mecanismo único cross-domain: improviso vira regra provisória com `domain` + vocabulário fechado. |
| **Regra provisória** | — | Regra emitida pelo GM com `verdict: systemic`; entra viva, revisável no painel. |
| **Registro de plausibilidade** | — | Conjunto de operações que o GM pode invocar num cenário (B-044). Portão da promoção. |
| **Stance** | — | Viés relacional comprimido (`trust`, `distrust`, …) em opiniões; pré-filtro por `topic`. |
| **Domain** | — | Domínio da promoção: `substrate`, `body`, `social`, `cognition`, `community`. |

## Corpo

| Termo | Código | Significado |
|-------|--------|-------------|
| **Parte** | `BodyPartState` | Nó da árvore anatômica. Tem vida, material corrente e capacidades que serve. |
| **Tecido** | `tissue` | Material com a etiqueta `tissue`. ⚑ **não** é uma categoria própria: é uma etiqueta no catálogo único. E ⚑ o material de roupa e cortina se chama **pano**, justamente para não colidir com este sentido. |
| **Condição** | `Condition` | A unidade única de saúde. Ferimento, doença, cicatriz, prótese, efeito de substância, condição crônica e estado mental são todos isto, com severidade 0.0–1.0. ⚑ o documento original falava em "gravidade 0–5"; o inteiro virou o **estágio**, derivado da severidade. |
| **Estágio** | `stage` | Faixa nomeada da severidade. **Derivado**, nunca atribuído. |
| **Capacidade** | `Capacities` | Função corporal agregada: consciência, manipulação, visão, locomoção, fala. **Todas derivadas** de partes e condições. |
| **Matriz de lesão** | — | Tipo de dano cruzado com propriedade do material, produzindo condição. Mesmo formato da matriz de reação. |
| **Corrida de infecção** | — | Severidade contra imunidade, ambas de 0 a 1. A primeira a chegar vence. |
| **Registro de plausibilidade** | — | Conjunto de operações que o GM está autorizado a invocar num cenário. Guarda contra deriva tonal. |

## Tempo

| Termo | Código | Significado |
|-------|--------|-------------|
| **Tick** | `tick` | Menor unidade de avanço. 1 tick = 1 minuto simulado. |
| **Tempo simulado** | `simTime` | Minutos decorridos desde o início. Toda datação usa isso. |
| **Dia** | `day` | 1440 ticks. |
| **Estação** | `season` | Bloco de ~15 dias. Gatilho de reavaliação secundária. ⚑ o documento usava "ciclo sazonal" e "período médio" para a mesma coisa. |
| **Ano** | `year` | 4 estações. |
| **Era** | `era` | ~30 anos. Camada mais alta da memória. |

## Agente

| Termo | Código | Significado |
|-------|--------|-------------|
| **Agente** | `Agent` | Uma pessoa simulada. ⚑ o documento dizia "Pessoa"; adotado **Agente** em código e **pessoa** em texto de UI voltado ao usuário. |
| **Vitalidade** | — | ⚑ **aposentado.** O documento original tinha uma barra de vida 0–100. Foi substituída pela árvore de partes e pelas capacidades derivadas: não existe número único de saúde, e a morte vem de parte vital destruída ou capacidade vital zerada. Ver a seção Corpo. |
| **Consciência** | `consciousness` | 0.0–1.0. Capacidade de articular raciocínio. **Derivada**, nunca definida à mão. Governa a escolha de tier. ⚑ o documento tratava "Saúde.Consciência" e "saúde < 70%" como se fossem a mesma coisa; são coisas distintas e só esta governa o tier. |
| **Necessidade** | `Need` | Variável que decai com o tempo: fome, sede, energia, higiene. |
| **Condição** | `Condition` | Ver a seção Corpo. É a unidade única de saúde, e não só "problema": prótese e cicatriz também são condições. |
| **Personalidade** | `Personality` | Traços numéricos mais descrição textual. Muda lentamente. |
| **Habilidade** | `Skill` | Competência 0–100 num domínio. Alimenta o tamanho de conversa e a seleção de comitês. ⚑ o documento referenciava "MédiaSkillSocial" e "maiores habilidades no tema" sem nunca definir o sistema. |
| **Cone de visão** | `visionCone` | Ângulo mais alcance. Percepção é limitada a ele, com oclusão por parede. |
| **Flag de estado** | `AgentFlag` | `sleeping`, `thinking`, `in_conversation`, `combat`, `unconscious`, `dead`. |

## Cognição

| Termo | Código | Significado |
|-------|--------|-------------|
| **Pensamento** | `Thought` | Monólogo interior gerado por LLM. |
| **Pensamento corriqueiro** | — | Rotineiro. Roda no tier `narrative`, ou `compact` se debilitado (consciência < 0.70). |
| **Pensamento aprofundado** | — | Deliberação longa. Roda em `agent.thought.reasoning` quando `requestedDeepThinking` ou gatilho grave. |
| **Gatilho** | `ThoughtTrigger` | O que provocou o pensamento: reativo, contemplativo, espontâneo, agendado, pós-interação, pós-veredito. |
| **Intenção** | `Intent` | O que o agente quer fazer, enviado ao GM. Não é ação ainda. |
| **Log de atividades** | `ActivityLog` | Cronologia factual e privada do que o agente de fato fez. Fonte da verdade contra a qual mentiras são comparadas. |
| **Buffer de curto prazo** | `ShortTermBuffer` | Acumulado bruto do dia, apagado ao dormir. |
| **Marcante** | `Marcante` | Evento de alto impacto emocional. 0 a 5 por dia. Sobe intacto pelas camadas. ⚑ termo mantido em português por não ter equivalente natural. |
| **Cascata de memória** | `MemoryWaterfall` | As camadas de compressão progressiva. |
| **Camada de memória** | `MemoryLayer` | `short_term`, `daily`, `seasonal`, `annual`, `quinquennial`, `decadal`, `era`. |
| **Margem de segurança** | `safetyOffset` | Dias recentes preservados crus além do que foi comprimido. Evita perder contexto próximo. |
| **Opinião** | `Opinion` | Crença atemporal sobre um conceito ou pessoa. |
| **Opinião geral** | — | Sobre conceitos, trabalho, ideologia. Processada à noite. |
| **Opinião social** | — | Sobre outro agente. Processada logo após a interação. |
| **Atemporalidade** | — | Regra: memória de longo prazo e opinião não usam "ontem", "recentemente", "semana passada". |
| **Impressão bruta** | `RawImpression` | Fato extraído de uma experiência, antes de virar opinião. |
| **Dissonância** | — | Conflito entre impressão nova e opinião existente. |
| **Sinergia** | — | Concordância. Aumenta a rigidez em vez de mudar a crença. |
| **Buffer de dissonância** | `dissonanceBuffer` | Contradições acumuladas contra uma opinião. |
| **Limiar de teimosia** | `stubbornnessThreshold` | Quanta contradição a opinião tolera antes de colapsar. Sobe com sinergia. |
| **Ruptura** | `OpinionBurst` | Colapso e reescrita da opinião. Dispara reavaliação de metas. |
| **Meta primária** | `primaryGoal` | Ambição de vida. Revista anualmente ou por trauma. |
| **Meta secundária** | `secondaryGoal` | Foco da estação. |
| **Meta terciária** | `tertiaryGoal` | Foco do dia, definido ao acordar. |
| **Capricho** | `Whim` | Impulso de minutos que interrompe a rotina sem alterar metas. |
| **Meta depreciada** | `deprecatedGoal` | Última meta abandonada, mantida como contexto de transição. |

## Interação

| Termo | Código | Significado |
|-------|--------|-------------|
| **Conversa** | `ConversationInstance` | Instância temporária com participantes, turnos e transcrição. |
| **Handshake** | — | Checagem de disponibilidade antes de iniciar conversa. |
| **Bloqueador rígido** | `HardBlocker` | Condição que impede conversa: combate, inconsciência, emergência. |
| **Turno** | `Turn` | Uma fala de um participante. |
| **Realocação** | `RelocationProposal` | Proposta de mover a conversa para outro lugar. |
| **Delta de sentimento** | `sentimentDelta` | −10 a +10 aplicado à relação após a conversa. |
| **Relação** | `Relationship` | Valor numérico entre dois agentes, distinto da opinião social textual. |
| **Corroboração** | — | Confronto de um relato verbal com o log de quem estava no mesmo setor. |
| **Assembleia** | — | Reunião de todos os agentes conscientes. |
| **Comitê** | — | Reunião de especialistas por habilidade. |
| **Ata** | `MeetingVerdict` | Saída estruturada da reunião. Altera leis e metas comunitárias. |
| **Lei da comunidade** | `CommunityLaw` | Norma vigente. Entra no contexto do GM e dos agentes. |
| **Grito** | `Shout` | Fala de alcance ampliado. A engine o entrega como fato perceptível a cada ouvinte, com viés derivado da relação. ⚑ não há chamada de LLM por ouvinte. S-031, S-032. |
| **Opção tática** | — | ⚑ **aposentado.** Conflito é escolha de agência decidida no pensamento normal, sem prompt tático nem lista pré-calculada. S-030. |

## Game Master

| Termo | Código | Significado |
|-------|--------|-------------|
| **GM** | `GameMaster` | Mediador invisível. Interpreta intenção, decide e altera o mundo. |
| **Veredito** | `verdict` | `executed`, `partial`, `reinterpreted`, `denied`. ⚑ substitui a aprovação binária do documento original. |
| **Mutação de mundo** | `WorldMutation` | Alteração concreta emitida pelo GM e aplicada pela engine. |
| **Retorno diegético** | `agentFeedback` | O que o agente percebe. Nunca linguagem de sistema. |
| **Lei inviolável** | `InviolableLaw` | Regra do cenário que o GM não contorna. |
| **Instrução do usuário** | `userInstruction` | Orientação com prioridade máxima sobre o GM. |
| **Memória do GM** | — | ⚑ **aposentado.** A coerência entre dias vem do estado do mundo, que é autoritativo na engine, e do log causal determinístico (`R-048`) — ambos grátis. Um resumo em prosa seria uma segunda fonte de verdade inflando o prompt mais chamado. |

## Camada LLM

| Termo | Código | Significado |
|-------|--------|-------------|
| **Tier** | `Tier` | Nível de pensamento com binding próprio de modelo: `utility`, `instinct`, `standard`, `deep`, `archivist`, `gm_fast`, `gm_deep`, `builder`. ⚑ substitui os `ROLE_*` do documento, que misturavam papel e modelo. |
| **Binding** | `ModelBinding` | Amarração tier → provedor, modelo e parâmetros. Configuração, não código. |
| **Preset** | `Preset` | Conjunto nomeado de bindings. Alterna a simulação inteira de uma vez. |
| **Capacidade** | `Capability` | Requisito que o modelo precisa atender: saída estruturada, reasoning, tools, contexto mínimo. |
| **Cassete** | `Cassette` | Gravação de uma chamada, indexada por hash, para replay determinístico. |
| **Passe de reparo** | `repairPass` | Nova tentativa quando a saída não valida contra o schema. |
| **Trace** | `CallTrace` | Registro completo: prompt renderizado, resposta crua, modelo, custo, latência. |
| **Degradação** | — | Queda para heurística sem LLM quando o budget estoura. |

## Correspondência com os termos antigos

| Documento original | Agora | Motivo |
|--------------------|-------|--------|
| `ROLE_BASE_LOW` | tier `instinct` | papel e modelo eram a mesma coisa; agora são separados |
| `ROLE_BASE_HIGH` | tier `standard` | idem |
| `ROLE_REASONING` | tier `deep` | idem |
| `ROLE_SUMMARIZER` | tier `archivist` | idem |
| "Pessoa" | Agente / pessoa | código em inglês, UI em português |
| "vida (0-100)" | árvore de partes + capacidades | uma barra só não diz *o quê* quebrou, e é justamente isso que gera história |
| "Saúde.Consciência" | `consciousness` derivada | era tratada como entrada; é saída |
| tabela de tecidos | catálogo único de materiais | tecido e material de construção eram a mesma ideia escrita duas vezes |
| "Script psicótico" | — | removido; ver ADR sobre agência livre |
| "Aprova / Nega" | quatro vereditos | o binário forçava negar o improvável |
