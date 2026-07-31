# SPEC-A — Agente

Entidade, percepção, movimento, personalidade, habilidades, inventário e rotina.

O corpo está em [SPEC-B](SPEC-B-corpo.md). A mente está em [SPEC-C](SPEC-C-cognicao.md).

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

**Aceite:** tentar pegar objeto distante é rejeitado por distância antes de chegar ao GM; gritar para alguém distante não é.

### A-011 — Índice espacial
`P0` · `V1` · derivado · dep: W-001

Consultas de proximidade e percepção resolvidas por particionamento espacial, nunca por varredura de todos contra todos.

**Aceite:** o custo de consulta de vizinhança não cresce quadraticamente com o número de agentes.

---

## Corpo e saúde

Migrado para [SPEC-B-corpo.md](SPEC-B-corpo.md).

O que era `A-012` a `A-019` virou um substrato biológico completo — árvore de partes, condições unificadas, capacidades derivadas, lesão, infecção, cuidado e fronteira com o GM — e ganhou documento próprio. Os requisitos correspondentes agora são `B-001` a `B-051`.

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

### A-024 — Inventário por slots
`P0` · `V4` · PDF 64 · dep: W-030

Duas mãos, vestimenta e mochila com capacidade limitada.

**Aceite:** pegar um item com as duas mãos ocupadas exige guardar ou largar antes.

### A-025 — Equipar
`P1` · `V4` · derivado · dep: A-024

Itens equipáveis ocupam slot e alteram affordances e aparência percebida.

**Aceite:** empunhar um martelo torna `reparar` disponível e é visível para quem observa.

### A-026 — Transferência de posse
`P1` · `V4` · derivado de PDF 65-66 · dep: A-024, G-005

Dar, receber, largar e pegar, todos mediados pelo GM e refletidos como mutação de inventário.

**Aceite:** um item dado sai do inventário de um e entra no do outro numa única mutação consistente.

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

### A-029 — Relações numéricas
`P1` · `V6` · PDF 482-483 · dep: A-001

Valor de −100 a +100 por par de agentes, distinto da opinião social textual e vinculado a ela.

**Aceite:** `sentimentDelta` de uma conversa altera o número imediatamente, e a opinião textual segue seu próprio ciclo mais lento.

### A-030 — Geração de perfil inicial
`P1` · `V3` · PDF 3-5 · dep: A-020, A-022 · prompt: `generation.agent_profile`

Perfis coerentes com o cenário, sem nomes repetidos, com diversidade de idade, função e temperamento, e sementes de relação que criam tensão inicial.

**Aceite:** gerar oito agentes produz oito nomes distintos e ao menos duas sementes de relação negativa.
