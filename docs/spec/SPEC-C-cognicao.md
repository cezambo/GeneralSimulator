# SPEC-C — Cognição

Pensamento, memória, opiniões e objetivos. É o motor mental do agente: o que entra na cabeça dele, o que fica, o que ele passa a acreditar e o que ele decide perseguir.

O corpo que condiciona esse motor está em [SPEC-B](SPEC-B-corpo.md). A conversa que o alimenta está em [SPEC-S](SPEC-S-interacao.md). A mediação das ações que ele decide está em [SPEC-G](SPEC-G-gm.md).

---

## Princípio de custo

Este é o documento mais caro do projeto, porque quase todo requisito aqui vira chamada de LLM. Três disciplinas valem para tudo o que segue:

**Uma chamada decide uma coisa.** O pensamento devolve pensamento **e** decisão na mesma resposta. Não existe roteador antes nem tradutor depois.

**Profundidade é determinística.** Quem escolhe o tier é a consciência do agente (`B-014`), não um modelo. Decidir como pensar não pode custar uma chamada.

**Contexto é comprimido na origem.** Opinião guarda um `stance` curto além da nuance; corpo entra como prosa de uma linha; relação entra como rótulo, não como tabela. O que só vai virar prosa no prompt é guardado do jeito mais barato que ainda gera aquela prosa.

---

## Pensamento

### C-001 — Ciclo de pensamento
`P0` · `V5` · PDF 74-79 · dep: A-001, B-014 · prompt: `agent.thought.base_low`, `agent.thought.base_high`, `agent.thought.reasoning`

O agente pensa em ciclos discretos. Cada ciclo monta contexto, escolhe profundidade, faz **uma** chamada e recebe de volta um monólogo interior mais uma decisão de ação, conforme `agent_thought_response`.

Não há chamada de roteamento antes nem chamada de tradução depois. O ciclo custa uma chamada de LLM, ou zero quando degradado por orçamento.

**Aceite:** um ciclo completo de pensamento consome exatamente uma chamada de LLM e produz `thought` e `decision` numa única resposta válida.

### C-002 — Contexto de pensamento
`P0` · `V5` · derivado de PDF 74-90 · dep: C-001, A-027, B-030

Bloco montado pela engine antes de cada pensamento: identidade, aparência, personalidade, corpo em prosa curta (`B-030`), necessidades salientes, rotina (`A-027`), função, metas correntes, opiniões filtradas (`C-030`), memórias recuperadas (`C-018`), inventário, relações comprimidas (`A-029`) e percepção corrente.

A rotina entra **sempre**, sem exceção. O resto entra por saliência: o que não afeta a decisão corrente é omitido.

**Aceite:** o contexto cabe no orçamento de tokens declarado em `tuning.json`, contém a rotina em todos os casos, e omite condições, capacidades e opiniões irrelevantes ao gatilho corrente.

### C-003 — Gatilhos de pensamento
`P0` · `V5` · PDF 74-79 · dep: C-001

Quatro origens: **reativo** (algo percebido exige resposta), **agendado** (marco de rotina), **contemplativo** (ociosidade prolongada) e **espontâneo** (amostragem rara durante atividade longa).

Cada gatilho carrega tipo e detalhe para o prompt, e cada um tem cadência própria em `tuning.json`.

**Aceite:** os quatro gatilhos disparam em condições distintas e o tipo aparece no contexto enviado ao modelo.

### C-004 — Profundidade determinística
`P0` · `V5` · decisão · dep: C-001, B-014

A consciência derivada do corpo escolhe o nível, sem LLM: abaixo do limiar de instinto, `agent.thought.base_low`; acima, `agent.thought.base_high`; e `agent.thought.reasoning` quando há gatilho grave ou escalada pendente.

Dor acima do limiar de pânico e consciência muito baixa forçam o nível instintivo independentemente do gatilho. Um agente em agonia não delibera.

**Aceite:** rebaixar a consciência de um agente muda o prompt escolhido sem nenhuma chamada de classificação, e agente em dor extrema nunca recebe o prompt de deliberação.

### C-005 — Escalada para deliberação
`P1` · `V5` · decisão · dep: C-004

O pensamento corriqueiro pode levantar `meta.requestedDeepThinking`. A escalada é atendida **no ciclo seguinte**, não imediatamente: a decisão corrente já é válida e refazê-la gastaria duas chamadas para uma ação.

Adiar custa um compasso simulado e ganha qualidade — a deliberação acontece já com a consequência da ação rasa no contexto. Escalada levantada com consciência abaixo do limiar é descartada.

**Aceite:** levantar a bandeira agenda deliberação para o próximo ciclo do agente e não dispara segunda chamada no ciclo corrente.

### C-006 — Decisão embutida
`P0` · `V5` · decisão · dep: C-001

A intenção sai no mesmo objeto do pensamento: `actionType`, alvo, destino, `intentDescription` em linguagem natural e fala opcional. Não existe passo separado de intenção.

A `intentDescription` é o que o GM lê quando é chamado, e é o que o registro de atividade guarda quando não é.

**Aceite:** nenhum caminho do código emite uma segunda chamada para converter pensamento em ação.

### C-007 — Orçamento e degradação
`P0` · `V5` · decisão · dep: C-001, L-006

Cada agente tem teto de chamadas por dia simulado. Ao se aproximar do teto, gatilhos espontâneos e contemplativos são suprimidos primeiro; depois os agendados de baixa prioridade; reativos graves são os últimos a cair.

Ao estourar, o agente segue rotina e affordances sem LLM, e o fato é registrado como degradação visível no painel — nunca em silêncio.

**Aceite:** um agente que atinge o teto continua agindo por rotina, e a degradação aparece no painel identificando qual agente e a partir de que hora simulada.

### C-008 — Affordances no contexto
`P0` · `V4` · derivado de PDF 103-104 · dep: C-002, W-031

As ações suportadas pelos objetos e pelo ambiente ao alcance entram no contexto como lista curta. É o que ancora a decisão no que o mundo de fato oferece.

Affordance disponível resolve sem GM (`W-031`); o contexto existe para que o agente escolha entre o que existe antes de inventar o que não existe.

**Aceite:** o contexto de pensamento lista as affordances ao alcance, e uma decisão que casa com uma delas não gera chamada de GM.

### C-009 — Pensamento corrente exposto
`P1` · `V5` · PDF 88-90 · dep: C-001

O último monólogo interior fica acessível para inspeção na UI e para o balão de pensamento, sem custo adicional.

**Aceite:** selecionar um agente mostra o pensamento mais recente sem disparar chamada.

### C-010 — Registro de atividade
`P0` · `V5` · PDF 517-520 · dep: C-001

Log privado e determinístico do que o agente **de fato** fez: tempo, ação, alvo, setor, veredito e desfecho. Não passa por LLM e não é memória — é o fato contra o qual relato e mentira são comparados.

**Aceite:** toda ação resolvida, com ou sem GM, gera entrada no registro, e o registro nunca é reescrito.

---

## Memória

### C-011 — Memória de curto prazo
`P0` · `V5` · PDF 91-95 · dep: C-010

Janela recente de impressões cruas disponível ao pensamento sem sumarização. Tem teto de itens e é descartada ao ser condensada na camada diária.

**Aceite:** o pensamento acessa eventos das últimas horas simuladas em texto bruto, e a janela não cresce sem limite.

### C-012 — Cascata de memória
`P0` · `V5` · PDF 91-100 · dep: C-011

Condensação em degraus: curto prazo → diária → sazonal → longas. Cada degrau lê o de baixo, produz um resumo e libera o material consumido, exceto o que é marcante.

As camadas acima da anual existem na especificação e no schema, mas **não disparam** dentro do critério de pronto de `V7`, que são 30 dias simulados. Elas são validadas apenas em execução longa dedicada, e isso é deliberado: a estrutura é barata de manter e cara de retrofitar.

**Aceite:** um dia simulado completo produz uma memória diária e libera as impressões consumidas; uma estação produz uma sazonal.

### C-013 — Marcantes sobem intactos
`P0` · `V5` · PDF 96-98 · dep: C-012

Evento marcado como marcante atravessa todas as camadas sem ser reescrito. É o que impede que a sumarização apague o que define o agente.

**Aceite:** um evento marcante do dia 1 aparece com o mesmo texto na memória sazonal.

### C-014 — Seleção de marcantes
`P0` · `V5` · PDF 96-98 · dep: C-013 · prompt: `memory.marcantes_selection`

Ao fim do dia, zero a cinco eventos são eleitos marcantes, com impacto de 1 a 5. **Zero é resposta válida e comum** — a maioria dos dias não marca ninguém.

**Aceite:** um dia sem acontecimento relevante produz lista vazia sem erro de validação.

### C-015 — Resumo diário
`P0` · `V5` · PDF 91-95 · dep: C-012, C-014 · prompt: `memory.daily_summary`

Lote noturno que condensa registro de atividade e impressões do dia num resumo atemporal, preservando os marcantes eleitos.

**Aceite:** ao virar o dia, cada agente desperto ganha exatamente uma memória diária.

### C-016 — Resumo sazonal
`P1` · `V7` · PDF 91-95 · dep: C-015 · prompt: `memory.seasonal_summary`

Condensa as memórias diárias da estação, preservando marcantes.

**Aceite:** ao fim de uma estação, as diárias do período viram uma sazonal e são liberadas.

### C-017 — Camadas longas parametrizadas
`P2` · `V7` · derivado · dep: C-016 · prompt: `memory.longterm_summary`

Anual, quinquenal, decadal e era usam **um** prompt e **um** schema, com o nível como variável. Devolvem parágrafos gerais, parágrafos sociais e marcantes preservados.

Quatro camadas não justificam quatro prompts. O que muda entre elas é a janela de entrada e a palavra que nomeia o período.

**Aceite:** trocar o nível de entrada produz resumo do período correto sem outro arquivo de prompt.

### C-018 — Recuperação de memória relevante
`P0` · `V5` · derivado de PDF 91-100 · dep: C-012, C-002

Antes de cada pensamento, a engine seleciona deterministicamente quais memórias entram no contexto: as marcantes ligadas às entidades presentes, as recentes, e as que casam com o tópico do gatilho. Nunca todas.

**Aceite:** o bloco de memórias do contexto respeita um teto declarado e prioriza marcantes ligadas a quem está presente.

### C-019 — Relato verbal
`P1` · `V6` · PDF 517-524 · dep: C-010, A-020 · prompt: `social.conversation_turn`

Quando perguntado sobre o que fez, o agente consulta o próprio registro de atividade e responde **dentro do turno de conversa** — sem prompt dedicado. A honestidade da personalidade modula quanto o relato se afasta do registro.

Mentira e omissão são comportamento de conversa, não subsistema. O turno já tem o registro em contexto e já tem a personalidade.

**Aceite:** um agente de baixa honestidade produz relato divergente do próprio registro, e a divergência é auditável comparando os dois.

### C-020 — Corroboração cruzada
`P2` · `V6` · derivado de PDF 517-524 · dep: C-019, C-010

Quem estava no mesmo setor no mesmo período tem registro próprio do que viu. Confrontar versões é comparar registros, deterministicamente.

**Aceite:** dois agentes que estiveram no mesmo setor têm entradas compatíveis, e uma versão que contradiz o registro do outro é detectável sem LLM.

### C-021 — Memória criada pelo usuário
`P2` · `V5` · PDF 99-100 · dep: C-012

O usuário injeta uma memória num agente pela UI, marcada como criada por usuário, e ela participa da cascata normalmente.

**Aceite:** memória injetada aparece no próximo contexto de pensamento e é preservada ou condensada conforme a camada.

---

## Opiniões

### C-022 — Entidade opinião
`P0` · `V5` · PDF 435-460 · dep: A-001

Conforme `Opinion` em `domain.schema.json`. Crença nomeada sobre um alvo, com nuance textual, buffer de dissonância, limiar de teimosia base e corrente.

**Aceite:** uma opinião é criada, serializada e restaurada sem perda de campo.

### C-023 — Opinião geral e social
`P0` · `V5` · PDF 435-445 · dep: C-022

Duas espécies no mesmo tipo: **geral** aponta para um conceito (trabalho, forasteiros, a lei); **social** aponta para um agente e é o par textual do sentimento numérico de `A-029`.

**Aceite:** ambas as espécies usam o mesmo caminho de dissonância e ruptura, sem código separado.

### C-024 — Nuance atemporal
`P0` · `V5` · PDF 446-450 · dep: C-022

A nuance tem de uma a três frases e **nunca** usa marcador temporal relativo. Uma opinião não sabe quando foi formada; ela apenas é.

Sem isso, resumos e opiniões acumulam "ontem" e "recentemente" que envelhecem errado e produzem texto incoerente meses simulados depois.

**Aceite:** numa amostra de nuances geradas, nenhuma contém marcador temporal relativo.

### C-025 — Classificador de dissonância
`P0` · `V5` · PDF 451-458 · dep: C-022, C-030 · prompt: `cognition.dissonance_classifier`

Uma chamada classifica **todas** as impressões novas contra as opiniões relevantes, devolvendo pares com relação (conflito ou sinergia) e intensidade de 1 a 3. Pares sem relação são omitidos da resposta.

É o prompt de maior volume do sistema e o único ponto que decide se uma experiência contradiz ou reforça uma crença. Sem ele o buffer nunca enche e a ruptura nunca acontece.

**Aceite:** uma conversa com seis impressões e vinte opiniões relevantes consome uma chamada, não cento e vinte.

### C-026 — Buffer de dissonância
`P0` · `V5` · PDF 451-458 · dep: C-025

Conflitos classificados acumulam no buffer da opinião, cada um com texto, intensidade e tempo. O buffer é o que mede a pressão contra uma crença.

**Aceite:** conflitos sucessivos elevam a soma de intensidade da opinião alvo de forma acumulada.

### C-027 — Limiar de teimosia
`P0` · `V5` · PDF 459-460 · dep: C-026, A-020

Cada opinião tem limiar derivado da teimosia da personalidade. Enquanto a soma do buffer não cruza o limiar, a crença resiste.

**Aceite:** duas personalidades com teimosia diferente exigem quantidades diferentes de conflito para romper a mesma crença.

### C-028 — Sinergia eleva o limiar
`P1` · `V5` · PDF 459-460 · dep: C-027

Impressões classificadas como sinergia **aumentam** o limiar corrente acima do base. Confirmação endurece a crença.

É o que produz o agente que fica mais difícil de convencer justamente porque vinha sendo confirmado.

**Aceite:** uma sequência de sinergias eleva o limiar corrente, e o mesmo volume de conflito que antes rompia deixa de romper.

### C-029 — Ruptura de opinião
`P0` · `V5` · PDF 451-460 · dep: C-027 · prompt: `cognition.opinion_burst`

Quando o buffer cruza o limiar, a opinião é **reescrita** — nova nuance, novo `stance`, severidade `nuance_shift` ou `inversao`. O buffer zera, o limiar volta ao base, e as metas secundária e terciária entram em reavaliação (`C-044`).

**Aceite:** buffer acima do limiar reescreve a nuance, zera o buffer, restaura o limiar base e dispara reavaliação de meta no mesmo ciclo.

### C-030 — Compressão de opinião
`P0` · `V5` · decisão · dep: C-022

Toda opinião carrega, além da nuance, um `stance` canônico e um `topic`, ambos produzidos **na mesma chamada** que criou ou reescreveu a opinião — nunca por chamada extra.

O contexto de pensamento e o classificador recebem `stance` e `topic`, não a nuance inteira de todas as opiniões. O classificador ainda recebe `topicFilter` e só vê as opiniões cujo tópico intersecta as impressões em julgamento.

Sem isto, o prompt mais chamado do sistema é o único cujo contexto cresce indefinidamente ao longo da simulação.

**Aceite:** com duzentas opiniões armazenadas e seis impressões novas, o bloco enviado ao classificador respeita o teto de opiniões e de tokens de `tuning.json`, e nenhuma opinião é apagada do estado do agente.

### C-031 — Reflexão noturna
`P1` · `V5` · PDF 461-466 · dep: C-025 · prompt: `cognition.nightly_reflection`

Lote noturno que transforma o dia em impressões sobre **opiniões gerais** e propõe tópicos sobre os quais o agente ainda não tinha crença formada.

**Aceite:** uma noite produz um lote de impressões gerais e, quando cabível, candidatas a opinião nova.

### C-032 — Consolidação de opiniões
`P1` · `V7` · decisão · dep: C-030, C-031

Opiniões com mesmo alvo e mesmo tópico são candidatas a fusão no lote noturno. A consolidada referencia as absorvidas, que ficam arquivadas — não apagadas.

Comprimir a representação, não o histórico: consultar uma opinião absorvida devolve a consolidada.

**Aceite:** duas opiniões de mesmo alvo e tópico viram uma, e consultar o identificador de qualquer absorvida resolve para a consolidada.

### C-033 — Ordenação e truncamento
`P1` · `V5` · derivado · dep: C-030

Quando o conjunto filtrado ainda excede o teto, as opiniões são ordenadas por relevância ao tópico, recência e magnitude de sentimento, e o excedente vira **uma linha agregada** — não é descartado silenciosamente.

**Aceite:** um agente com opiniões acima do teto produz contexto no teto mais uma linha agregada, e a montagem é determinística entre execuções.

---

## Objetivos

### C-034 — Hierarquia de metas
`P0` · `V5` · PDF 467-480 · dep: A-001

Quatro níveis conforme `Goal`: primária de longo prazo, secundária de médio, terciária do dia e capricho de minutos. Todos entram no contexto de pensamento como bloco curto.

**Aceite:** um agente tem os quatro níveis distinguíveis e todos aparecem resumidos no contexto.

### C-035 — Meta primária
`P0` · `V5` · PDF 467-472 · dep: C-034

Ambição de fundo, muda raramente, e é o que dá direção ao agente ao longo de estações.

**Aceite:** a meta primária persiste entre dias e só muda por revisão explícita.

### C-036 — Metas secundária e terciária
`P0` · `V5` · PDF 467-476 · dep: C-035

A secundária é o passo de médio prazo que serve a primária; a terciária é o que o agente pretende fazer hoje, definida ao acordar e influenciada pela função na comunidade.

**Aceite:** ao acordar, o agente define meta do dia coerente com a secundária e com a função.

### C-037 — Capricho
`P2` · `V5` · PDF 477-480 · dep: C-034 · prompt: `cognition.whim_generation`

Impulso de minutos, com validade declarada, disparado por tédio, traço, memória ou ambiente. **Retornar nada é resposta válida** quando nada puxa o agente.

**Aceite:** um agente entediado perto de uma affordance atraente gera capricho com duração, e um agente ocupado devolve nulo sem erro.

### C-038 — Meta obsoleta
`P1` · `V5` · derivado · dep: C-034

Meta invalidada por circunstância não some: vira obsoleta com motivo registrado, e permanece disponível ao contexto como frustração.

O ferreiro que perdeu a mão precisa lembrar do que não pode mais fazer. É isso que torna a perda dramática em vez de administrativa.

**Aceite:** meta invalidada é preservada com motivo e aparece no contexto como abandonada, não removida do estado.

### C-039 — Meta criada pelo usuário
`P2` · `V5` · PDF 99-100 · dep: C-034

O usuário define meta em qualquer nível pela UI, marcada como criada por usuário. Ela participa da revisão normalmente, mas a revisão precisa de justificativa mais forte para descartá-la.

**Aceite:** meta injetada pelo usuário entra no contexto e resiste a uma revisão que descartaria uma meta equivalente gerada pelo sistema.

### C-040 — Revisão unificada de meta
`P0` · `V5` · decisão · dep: C-034 · prompt: `cognition.goal_revise`

**Um** prompt e **um** schema para toda revisão, em qualquer nível e por qualquer gatilho. O nível e o gatilho são variáveis de entrada; a resposta traz texto da meta, justificativa, motivo de obsolescência quando houver, e os níveis abaixo que a mudança invalidou.

Quatro prompts de meta eram a mesma tarefa escrita quatro vezes.

**Aceite:** revisar meta diária e revisar meta anual usam o mesmo arquivo de prompt e o mesmo schema, diferindo apenas nas variáveis.

### C-041 — Gatilho diário
`P0` · `V5` · PDF 467-476 · dep: C-040

Ao acordar, o agente revisa a meta terciária à luz do estado corrente e da secundária.

**Aceite:** cada agente desperto revisa a meta do dia exatamente uma vez por dia simulado.

### C-042 — Gatilho sazonal
`P1` · `V7` · derivado · dep: C-040, C-016

Ao virar a estação, a meta secundária é revisada contra a memória sazonal recém-formada.

**Aceite:** a virada de estação dispara revisão da secundária usando a sazonal como entrada.

### C-043 — Gatilho anual
`P2` · `V7` · derivado · dep: C-040, C-017

Ao virar o ano, a meta primária é revisada contra a memória longa. Como as camadas longas não disparam em 30 dias simulados (`C-012`), este gatilho só é exercido em execução longa dedicada.

**Aceite:** a virada de ano dispara revisão da primária usando a memória longa como entrada.

### C-044 — Gatilho reativo
`P0` · `V5` · PDF 451-460 · dep: C-040, C-029, B-031

Revisão fora de cadência, disparada por ruptura de opinião (`C-029`), por capacidade perdida que inviabiliza a meta (`B-031`), por morte de alguém próximo ou por mudança material grave.

É o gatilho que produz crise. Os outros três produzem manutenção.

**Aceite:** perder manipulação abaixo do exigido por uma meta ativa dispara revisão no mesmo ciclo, sem esperar o dia virar.

### C-045 — Cascata de revisão
`P1` · `V5` · derivado · dep: C-040

Quando a revisão devolve níveis invalidados, eles são revisados em seguida — no máximo **um** nível de cascata por evento, para que uma crise não consuma o orçamento do dia inteiro.

**Aceite:** uma revisão de primária que invalida secundária e terciária dispara no máximo um nível adicional de revisão por evento.

---

## Fronteira com o GM

O GM não escreve na cognição. Ele produz fatos e vereditos; a cognição os interpreta.

Uma negação do GM entra como impressão comum e pode virar dissonância — é assim que um agente frustrado repetidamente muda de crença sobre o que é possível no mundo. O GM nunca reescreve opinião, meta ou memória diretamente.

A exceção é a promoção de regra no domínio `cognition`, especificada em [SPEC-G](SPEC-G-gm.md): o GM pode propor que um tópico passe a produzir um `stance` de forma determinística, e essa regra é revisável no painel como qualquer outra.

---

## Não-objetivos

**Emoções como sistema numérico.** Emoção é campo de texto no pensamento e tom na conversa. Não há vetor de humor com decaimento.

**Teoria da mente explícita.** O agente não modela o que o outro acredita. Ele tem opinião sobre o outro, e isso basta.

**Planejamento hierárquico com busca.** Metas são texto que orienta o modelo, não árvore de tarefas resolvida por planejador.

**Aprendizado entre execuções.** Nada persiste de uma partida para outra.
