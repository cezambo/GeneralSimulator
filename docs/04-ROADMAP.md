# Roadmap — Fatias Verticais, Mundo Primeiro

**Ordem definida em 31/07/2026:** construir mundo e modo construção antes da cognição profunda.

---

## Por que esta ordem se sustenta

A escolha não é só preferência. Três argumentos técnicos a favor:

1. **Cognição precisa de affordances reais.** O PDF inteiro assume que o agente interage com tiles, materiais, móveis e itens. Projetar o motor cognitivo contra um mundo imaginário produz prompts que não batem com o que existe. Com o mundo pronto, `{{affordances}}` e `{{world_snapshot}}` deixam de ser especulação.

2. **O mundo é a parte determinística.** Grid, tiles, materiais, pathfinding e construção não dependem de LLM. Dá pra construir com testes normais, rápido e barato, sem gastar token nenhum. Terminar essa base primeiro significa que, quando a cognição entrar, todo bug novo é bug de cognição — não ambiguidade entre as duas camadas.

3. **Avaliação visual é trabalho de design.** Ver o mundo cedo permite julgar escala de tile, densidade de cidade, legibilidade do top-down e o feel do modo construção. Essas decisões, uma vez tomadas, restringem o resto.

**O risco que isso cria:** o custo de descobrir tarde que o loop cognitivo não fecha. A mitigação está em V0.

---

## V0 — Fundação e de-risking (antes de qualquer render)

Curta, mas não pulável. Duas coisas que são caras de retrofitar depois:

- Esqueleto do monorepo: `sim-core` (TS), `client-godot` (GDScript), `panel-web` (React)
- `schemas/` como fonte única, com geração de tipos TS
- **Protocolo WebSocket** do `05-PROTOCOLO.md`, com handshake, snapshot e reconexão
- **Camada LLM completa**: OpenRouter, resolução de tier→modelo, validação de schema, passe de reparo, cassetes de gravação/replay, contabilidade de custo
- **Spike cognitivo descartável**: script headless, sala fake 5×5 sem render, 2 agentes, loop pensamento→GM→memória rodando 3 dias simulados

O spike roda inteiramente dentro do `sim-core`, sem Godot aberto. É a primeira prova de que a separação funciona.

O spike não é a implementação real e será jogado fora. Ele existe para responder uma pergunta por poucos dólares: *o loop fecha e produz algo coerente?* Se a resposta for não, é infinitamente mais barato descobrir agora do que depois de V3.

A camada LLM entra aqui porque é independente do mundo e porque os cassetes precisam existir desde a primeira chamada — retrofitar gravação depois significa perder todo o histórico de iteração.

**Pronto quando:** o spike roda 3 dias simulados em modo replay, custo zero, resultado idêntico entre execuções.

---

## V1 — Mundo visível

- Grid, sistema de tiles, e o **catálogo único de materiais** classificados em material e elemento — já incluindo os tecidos, que só ganham uso em V5 mas não ganham tabela própria nunca
- Núcleo do substrato reativo: etiquetas, estados transientes, temperatura com limiares, matriz de reação em dado, propagação, cadeias, determinismo e log causal
- Vocabulário de efeitos nomeados aceitando as três espécies de alvo desde o começo: tile, objeto e parte de corpo
- Render top-down, câmera com pan e zoom
- Movimento contínuo e rotação livre (não travados no grid, conforme PDF linha 6)
- Pathfinding A*
- Agente placeholder que anda, gira e tem cone de visão com toggle de debug
- Relógio de simulação, play/pause, velocidades

**Pronto quando:** um agente placeholder atravessa um mapa construído à mão, contornando paredes, com o cone de visão visível — e um incêndio ateado num canto do mapa se alastra, consome, apaga e deixa escombro sem uma única chamada de LLM.

---

## V2 — Modo construção

O primeiro entregável que é genuinamente utilizável.

- Segunda camada do substrato: líquidos com volume, gases com difusão, coberturas persistentes, campos de luz e som
- Alternância normal/construção com pausa automática
- Overlay de grid, ferramentas de pintar, remover, rotacionar
- Menu com abas: tiles, móveis, itens, custom
- Catálogo de móveis e itens com nome, descrição, material
- Botão `+` para criar item customizado
- Hover com tooltip, cursor de mão aberta/fechada, arrastar e soltar
- Undo/redo
- Save/load do mundo

**Pronto quando:** dá pra construir uma casa completa e mobiliada do zero, salvar, fechar e reabrir idêntica.

---

## V3 — Geração procedural

- Tela pré-jogo: número de pessoas + descrição livre do cenário
- Gerador de terreno com parâmetros ajustáveis
- `generation.scenario_to_terrain` traduzindo descrição em parâmetros
- Loop agentico de construção com tool calls
- Validador de mapa: conectividade, locais obrigatórios, pontos de spawn

**Pronto quando:** "vila costeira com pouca água potável" gera um mapa jogável, conectado e coerente.

---

## V4 — GM e ações

Primeira LLM no laço principal da simulação.

- Protocolo intenção → GM → mutações de mundo
- `gm.evaluate_low` com cache, `gm.evaluate_high` com mutações
- Verdicts `executed` / `partial` / `reinterpreted` / `denied`
- Inventário funcional
- ActivityLog e ShortTermBuffer
- Exposição do substrato ao GM e resumo da matriz em linguagem natural
- Mutação `engine_effect` com regra de não-duplicação
- **Validador de causa contra derivado**: mutação que aponte para campo marcado como derivado é rejeitada antes de tocar o estado, com sugestão de qual condição produz o efeito
- Registro de plausibilidade do cenário limitando quais operações o GM pode invocar
- Painel de invocações recorrentes, que aponta dívida de matriz
- UI de instruções do usuário ao GM

**Pronto quando:** um agente tenta forçar uma porta trancada, o GM devolve consequência parcial com dano na mão, e o mundo reflete a mutação — e, no mesmo cenário, arremessar uma tocha num monte de palha não gera nenhuma chamada ao GM.

---

## V5 — Cognição

Aqui entra o motor mental completo.

- Roteador de tipo de pensamento e seletor de tier
- Pensamento nos três níveis, com gatilhos reativo, contemplativo, espontâneo e agendado
- **Substrato biológico**: árvore de partes sobre o catálogo de materiais de V1, condições unificadas com estágios, capacidades derivadas, matriz de lesão escrita em propriedade de material, dor, sangramento e necessidades como escalares com limiar
- Exposição do corpo ao GM: partes com material corrente, condições, capacidades e operações invocáveis — incluindo `transmute_part`, atrás do registro de plausibilidade
- Consciência selecionando o tier de LLM, e capacidade perdida invalidando objetivo
- Corpo entrando no prompt como prosa curta, dentro de orçamento de tokens
- Substâncias com payload e os quatro vetores de entrada, incluindo efeito cognitivo
- Efeitos do ambiente sobre o corpo, e o substrato inteiro chegando à percepção como fato descrito
- Personalidade
- Waterfall de memória: marcantes, diária, sazonal
- **Classificador de dissonância**, ruptura de opinião, reavaliação reativa de metas
- Hierarquia de objetivos e caprichos
- Painel do agente com as abas de leitura e edição
- Budget de chamadas por agente

**Pronto quando:** 3 agentes vivem 7 dias simulados autonomamente e ao menos uma opinião sofre ruptura que muda comportamento observável — e um agente que quebra o braço abandona sozinho o objetivo que dependia das mãos.

**Teste que prova a unificação:** transmutar o fêmur de um agente para `gelo` num ambiente a 20 °C destrói a parte por fusão, pelo mesmo caminho de código que derrete um bloco de gelo no chão, sem nenhuma regra escrita para o caso — e a cadeia inteira aparece no log causal.

---

## V6 — Social

- Handshake, ConversationInstance, turnos e limites
- Realocação espacial com votação
- Extensões dramáticas
- Payload pós-conversa alimentando o classificador de dissonância
- Relato verbal vs. ActivityLog (mentira e omissão)
- Corroboração cruzada entre agentes
- Coberturas e sinais corporais como evidência: sangue, cicatriz, tosse e mancar entram na formação de impressão
- Infecção como corrida, qualidade de tratamento, dependência de cuidado e contágio
- Transcrição visível na UI

**Pronto quando:** dois agentes conversam, um mente sobre o que fez no dia, e um terceiro que estava no mesmo setor confronta a versão depois — ou nota o sangue que o primeiro não lavou.

---

## V7 — Escala e extremos

- N agentes com performance aceitável
- Combate: opções táticas pré-calculadas, escolha da LLM, gritos semânticos
- Reuniões comunitárias e leis
- Estados mentais extremos via cognição livre
- Memória e consolidação do GM
- Camadas longas da waterfall (anual, quinquenal, decadal, era)
- Deriva de personalidade
- Timeline, minimap, exportação de log narrativo

**Pronto quando:** 10 agentes rodam 30 dias simulados sem crash, dentro do budget, com narrativa legível na exportação.

---

## Nota sobre prompts

A escrita dos ~16 prompts faltantes **não segue esta ordem sequencialmente**. Prompts são conteúdo, não código, e cada um é barato de escrever isolado. A regra prática: escrever o prompt junto com a fatia que o consome, e testá-lo contra o tier mais fraco assim que houver cassete.

Exceção: `cognition.dissonance_classifier` já foi escrito porque o spike de V0 precisa dele.
