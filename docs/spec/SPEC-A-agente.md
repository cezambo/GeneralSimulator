# SPEC-A — Agente

Entidade, percepção, movimento, personalidade, habilidades, inventário e rotina.

O corpo está em [SPEC-B](SPEC-B-corpo.md). A mente está em [SPEC-C](SPEC-C-cognicao.md). O que ele carrega está em [SPEC-O](SPEC-O-objetos.md).

---

## Entidade

### A-001 — Entidade agente
`P0` · `V1` · PDF 19, 38-81 · dep: —

Conforme `Agent` em `domain.schema.json`. Identidade, transform, biologia, personalidade, habilidades, inventário, relações, cognição, rotina, flags.

**Aceite:** um agente é criado, serializado e restaurado sem perda de campo.

### A-002 — Identidade
`P0` · `V1` · PDF 46 · dep: A-001

Nome, idade e descrição de aparência. A aparência entra no contexto de quem o observa.

**Aceite:** ao conversar, o prompt do interlocutor contém a descrição visual do outro.

### A-003 — Flags de estado
`P0` · `V1` · derivado · dep: A-001

`sleeping`, `thinking`, `in_conversation`, `combat`, `unconscious`, `dead`, `paused`. Flags são exclusivas quando logicamente incompatíveis e governam elegibilidade a interações.

**Aceite:** um agente inconsciente não é elegível a iniciar conversa nem recebe pensamento agendado.

### A-004 — Pausa individual
`P2` · `V5` · derivado · dep: A-003

O usuário congela um agente específico: não pensa, não age, não gasta budget. Ferramenta de depuração e de controle de custo.

**Aceite:** um agente pausado não gera nenhuma chamada de LLM enquanto o resto da simulação corre.

---

## Movimento e percepção

### A-005 — Movimento contínuo
`P0` · `V1` · PDF 41 · dep: W-002, W-038

Deslocamento suave ao longo do caminho calculado, com velocidade modulada por estado biológico.

**Aceite:** um agente ferido se move mais devagar que um saudável no mesmo trajeto.

### A-006 — Rotação independente
`P0` · `V1` · PDF 41 · dep: W-002

Orientação é separada da direção de deslocamento. Um agente pode andar de costas ou virar sem se mover.

**Aceite:** virar para olhar algo não altera a posição.

### A-007 — Cone de visão
`P0` · `V1` · PDF 39-40 · dep: A-006, W-008

Ângulo de abertura mais alcance, ancorado na rotação, com oclusão por tiles bloqueantes.

**Aceite:** um agente só percebe entidades dentro do cone e sem parede no caminho.

### A-008 — Alternância visual do cone
`P0` · `V1` · PDF 39-40 · dep: A-007

Interruptor de depuração que desenha o cone de todos os agentes ou de um selecionado.

**Aceite:** ligar o interruptor desenha os cones; desligar remove sem afetar a simulação.

### A-009 — Audição
`P1` · `V6` · derivado de PDF 512-516 · dep: A-001

Raio circular independente do cone de visão, sem oclusão direcional mas atenuado por material à prova de som. Base da propagação de gritos.

**Aceite:** um agente de costas ouve um grito dentro do raio.

### A-010 — Proximidade para interação
`P0` · `V4` · PDF 67-68 · dep: A-005

Ações exigem distância dentro do alcance de interação, exceto ações que declaram alcance próprio — gritar, acenar, arremessar.

**Aceite:** tentar pegar objeto distante é rejeitado por distância antes de chegar ao Validador; gritar para alguém distante não é.

### A-011 — Índice espacial
`P0` · `V1` · derivado · dep: W-001

Consultas de proximidade e percepção resolvidas por particionamento espacial, nunca por varredura de todos contra todos.

**Aceite:** o custo de consulta de vizinhança não cresce quadraticamente com o número de agentes.

### A-031 — O mundo entra no prompt como prosa
`P0` · `V2` · decisão · dep: A-007, R-037, B-030, O-020

Irmão de `B-030`, e pela mesma razão. Assim como o corpo nunca entra como tabela de partes, **o mundo nunca entra como lista de tiles e entidades**. O que a engine monta antes de cada pensamento é um relato curto em linguagem natural do que é saliente ao redor.

> "Você está na cozinha. A lareira está acesa e o cômodo está quente. Há pão na mesa e um balde de água ao lado da porta. Maria está de pé perto da janela, pálida, e tosse."

Não:

> `tile(3,4): temp=42.1 lit=0.8 · obj#221 ObjectDef=bread pos=(3,5) · agent#7 pos=(1,4) cond=[cough:2,pallor:1]`

**A montagem é determinística e não passa por modelo.** Nenhuma chamada de LLM converte estado em relato — a mesma cena produz o mesmo texto, palavra por palavra, para a mesma semente. Isto é o que permite ao cassete (`X-002`) reproduzir a execução, e é o que impede que o custo de perceber cresça com o tamanho do que se percebe.

Havia uma ideia de filtrar percepção por um modelo pequeno, e ela foi descartada: filtrar por LLM era **uma chamada por agente por pensamento**, dobrando o custo do sistema para produzir texto que a engine já sabe escrever, e introduzindo não-determinismo na única parte do laço que precisa ser reproduzível.

Este requisito existia como promessa espalhada e sem dono. `R-037` prometia que todo produto do substrato vira fato observável, `O-020` prometia que a percepção leva a descrição sensorial e nunca a funcional, `C-002` listava "percepção corrente" como um dos blocos do contexto — e nenhum dos três dizia **como montar**. Deixar isso para quem implementa contraria `X-010`: três domínios apontavam para um algoritmo que não estava escrito em lugar nenhum.

**Aceite:** a mesma cena montada duas vezes produz texto idêntico; nenhuma chamada de LLM acontece entre o estado do mundo e o relato; e para cada sistema de `SPEC-R` existe pelo menos uma frase correspondente que pode aparecer no relato.

### A-032 — Ordem de saliência e corte por orçamento
`P0` · `V2` · derivado de A-031 · dep: A-031, X-008

O relato cabe num orçamento de tokens declarado em `tuning.json`. Quando o que se percebe não cabe, o corte é **por ordem de saliência declarada**, e não por proximidade nem por ordem de varredura do grid.

A ordem, do que nunca cai para o que cai primeiro:

| Ordem | O que | Por que tem precedência |
|---|---|---|
| 1 | Perigo imediato — fogo ao alcance, agente hostil, chão cedendo | É o que dispara gatilho reativo (`C-003`). Cortar isto é o agente não reagir a estar em perigo |
| 2 | Pessoas presentes, com os sinais corporais visíveis (`B-032`) | A presença de outro muda toda decisão social, e quem some do relato deixa de existir para o agente |
| 3 | Mudança desde a última percepção | Novidade é o que gera impressão. Cenário estável já está na memória de curto prazo |
| 4 | Objetos com affordance útil à meta corrente (`C-008`, `W-031`) | É o que ancora a decisão no que o mundo de fato oferece |
| 5 | Ambiente contínuo — temperatura, luz, cheiro, som de fundo | Entra como uma frase, não como leitura por tile |
| 6 | Cenário estável de fundo | Primeiro a cair, e cai sem dano |

Sem ordem declarada, o corte fica dependendo de qual estrutura o código varreu primeiro, e duas execuções com a mesma semente divergem — o que quebra `X-004`. E o corte por proximidade, que é o palpite natural, é o pior possível: o fogo do outro lado do cômodo perde para a cadeira ao lado.

**Aceite:** o relato nunca passa do orçamento declarado; num cômodo com mais coisas do que cabe, perigo e pessoas aparecem e o mobiliário de fundo é o que some; e o corte é idêntico entre duas execuções da mesma cena.

### A-033 — O que a percepção nunca carrega
`P0` · `V2` · decisão · dep: A-031, O-020, O-025

O relato carrega o que os sentidos alcançam, e nada além. Nunca entram:

- **Descrição funcional de objeto** (`O-020`). A percepção leva a sensorial. Que a alavanca abra a comporta é coisa que se descobre, se deduz ou se ouve — e é por isso que existe crença por indivíduo (`O-025`), que seria inútil se ver o objeto já revelasse o que ele faz.
- **Identificador interno.** Nem de agente, nem de objeto, nem de tile. O agente vê "uma mulher pálida", não `agent#7`.
- **Número cru de simulação.** Volume, integridade, carga, coordenada. Temperatura vira "está quente", não `42.1`.
- **Qualquer coisa fora do cone, ocluída, ou fora do alcance do sentido** (`A-007`, `A-009`) — inclusive o que o jogador está vendo na tela.
- **Estado interno de outro agente.** Meta, opinião, dor, intenção. Só o que o corpo dele denuncia por fora (`B-032`).

O item mais fácil de violar por descuido é o último, porque no código o outro agente é um objeto com todos os campos à mão, e nada impede quem monta o relato de ler `goals` junto de `pos`. Um único vazamento desses apaga a mentira, a dedução e a formação de opinião de uma vez: não há o que descobrir sobre alguém cujo interior chega junto da aparência.

**Aceite:** um agente que mente sobre a própria meta não é contradito pelo relato de percepção de quem o observa; e uma inspeção do relato não contém identificador interno nem número de simulação.

---

## Corpo e saúde

Migrado para [SPEC-B-corpo.md](SPEC-B-corpo.md).

O que era `A-012` a `A-019` virou um substrato biológico completo — árvore de partes, condições unificadas, capacidades derivadas, lesão, infecção, cuidado e fronteira com o Validador — e ganhou documento próprio. Os requisitos correspondentes agora são `B-001` a `B-063`.

A faixa `A-012` a `A-019` fica **aposentada** e não deve ser reutilizada.

---

## Personalidade e habilidades

### A-020 — Personalidade
`P0` · `V5` · PDF 57-59 · dep: A-001

Cinco traços do Big Five, sete traços custom e descrição textual. Traços numéricos alimentam mecânica; o texto alimenta tom.

**Aceite:** `stubbornness` deriva o limiar de teimosia base e `honesty` modula o relato verbal.

### A-021 — Deriva de personalidade
`P2` · `V7` · PDF 57-59 · dep: A-020 · prompt: `agent.personality_drift`

Experiências significativas ou repetidas movem traços em incrementos pequenos. Ao cruzar limiar, o texto descritivo é reescrito.

**Aceite:** uma estação de traições consecutivas reduz `agreeableness` de forma acumulada e o texto muda ao cruzar o limiar.

### A-022 — Sistema de habilidades
`P1` · `V5` · derivado de PDF 463, 558-559 · dep: A-001

Competências nomeadas de 0 a 100. Mínimo: social, construção, medicina, cozinha, combate, artesanato, agricultura.

O documento original referenciava "média de habilidade social" no cálculo de turnos de conversa e "maiores habilidades no tema" na seleção de comitês, sem nunca definir o sistema. Este requisito preenche a lacuna.

**Aceite:** o cálculo de turnos e a formação de comitê leem daqui.

### A-023 — Progressão de habilidade
`P2` · `V7` · derivado · dep: A-022

Uso repetido de uma habilidade a aumenta lentamente.

**Aceite:** um agente que cozinha por uma estação tem `cozinha` mensuravelmente maior.

---

## Inventário e posses

A física das coisas — peso, volume, empacotamento, composição, pilha — está em [SPEC-O](SPEC-O-objetos.md). Aqui fica só o que é do portador.

### A-024 — Inventário volumétrico
`P0` · `V4` · PDF 64 refinado por decisão · dep: W-030, O-001, O-003

Mãos e vestimenta continuam existindo como **posições** de porte, conforme `InventorySlot`, porque equipar precisa de um lugar e porque o que está na mão é visível para quem olha. Mas o que cada posição aceita é decidido por peso e volume, nunca por contagem: uma mão leva o que cabe numa mão — duas maçãs e uma faca, sim; uma bigorna, não — e o que se guarda é limitado pela soma dos volumes efetivos (O-002, O-003).

A troca não é de precisão, é de gênero de decisão. Slot faz o agente perguntar se há vaga; volume faz ele perguntar o que vale a pena levar, e essa segunda pergunta é a que produz cena.

⚑ O critério de aceite anterior — "pegar um item com as duas mãos ocupadas exige guardar ou largar antes" — fica **aposentado** junto com o modelo de slots. Mão ocupada não é mão cheia.

**Aceite:** três objetos pequenos cabem numa mão só; guardar um objeto cujo volume efetivo excede o volume livre é recusado com retorno diegético e passa a caber depois que outro é retirado; nenhum limite de contagem aparece em nenhum caminho do inventário.

### A-025 — Equipar
`P1` · `V4` · derivado · dep: A-024, O-013

Itens equipáveis ocupam uma posição de porte e alteram affordances e aparência percebida.

O que está na mão ou vestido **não** está guardado: o multiplicador de empacotamento não se aplica, e o peso inteiro conta na carga de O-013. Equipar não muda a massa que a pessoa leva, muda onde ela está — e é por isso que passar o martelo da mochila para a mão libera volume sem aliviar nada.

**Aceite:** empunhar um martelo torna `reparar` disponível e é visível para quem observa; mover o mesmo martelo da mochila para a mão não altera a carga somada e altera o volume livre da mochila.

### A-026 — Transferência de posse
`P1` · `V4` · derivado de PDF 65-66 · dep: A-024, V-005, O-014

Dar, receber, largar e pegar, refletidos como mutação de inventário conforme `WorldMutation`.

A transferência valida o lado que recebe **antes** de aplicar: o que não cabe no volume livre, ou o que estouraria a capacidade de carga (O-014), é recusado com retorno diegético. A recusa é uma cena, não um erro — alguém estende uma coisa e o outro não tem como levar.

Um composto viaja inteiro, com o grafo (O-004). Uma pilha pode ser dividida, e a divisão produz exemplar novo com o multiplicador de solto (O-007). Largar devolve o objeto ao mundo físico, guardar o retira dele (O-009).

**Aceite:** um item dado sai de um inventário e entra no outro numa única mutação consistente; dar uma coisa que não cabe é recusado antes de qualquer mutação; dar vinte de uma pilha de sessenta divide o registro sem criar nem destruir exemplares.

---

## Rotina e função

### A-027 — Rotina persistente
`P1` · `V5` · PDF 69-70 · dep: A-001

Horários habituais de acordar, trabalhar e dormir, armazenados separadamente e **sempre** presentes no contexto de pensamento.

**Aceite:** todo prompt de pensamento contém a rotina, sem exceção.

### A-028 — Função na comunidade
`P1` · `V5` · PDF 69-70 · dep: A-027

Papel declarado — ferreiro, curandeiro, agricultor — que orienta metas e elegibilidade a comitês.

**Aceite:** a função aparece no contexto e influencia a meta terciária definida ao acordar.

### A-029 — Relações numéricas comprimidas
`P1` · `V6` · PDF 482-483 · dep: A-001

Valor de −100 a +100 por par de agentes, distinto da opinião social textual. No **prompt**, relações entram comprimidas: `stance` canônico (`trust`, `distrust`, `admire`, `pity`, `resent`, `indifferent`, `fear`, `desire`, `neutral`) + número só quando a decisão exige nuance fina.

**Pré-filtro:** quem classifica dissonância (`C-025`, hoje dentro de `social.post_conversation` e de `cognition.nightly_appraisal`) recebe `topicFilter` e opiniões já filtradas por `stance`/`topic` — não manda todas contra todas quando o tópico é conhecido.

**Grito de combate:** sem prompt LLM dedicado. A engine registra grito como **fato perceptível** (R-037); ouvintes aplicam **viés de relação** conforme sentimento com quem gritou (`obedecer` / `ignorar` / `contrariar` proporcional ao sentiment).

**Aceite:** `sentimentDelta` de conversa altera o número imediatamente; contexto de pensamento lista relações como stance, não tabela −100..+100; grito ouvido modula disposição tática sem chamada extra.

### A-030 — Geração de perfil inicial
`P1` · `V3` · PDF 3-5 · dep: A-020, A-022 · prompt: `generation.agent_profile`

Perfis coerentes com o cenário, sem nomes repetidos, com diversidade de idade, função e temperamento, e sementes de relação que criam tensão inicial.

**Aceite:** gerar oito agentes produz oito nomes distintos e ao menos duas sementes de relação negativa.
