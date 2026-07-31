# SPEC-C — Cognição

Pensamento, memória, opiniões e objetivos. É o motor mental do agente: o que entra na cabeça dele, o que fica, o que ele passa a acreditar e o que ele decide perseguir.

O corpo que condiciona esse motor está em [SPEC-B](SPEC-B-corpo.md). A conversa que o alimenta está em [SPEC-S](SPEC-S-interacao.md). A mediação das ações que ele decide está em [SPEC-V](SPEC-V-validador.md).

---

## Princípio de custo

Este é o documento mais caro do projeto, porque quase todo requisito aqui vira chamada de LLM. Três disciplinas valem para tudo o que segue:

**Uma chamada decide uma coisa.** O pensamento devolve pensamento **e** decisão na mesma resposta. Não existe roteador antes nem tradutor depois.

**Profundidade é determinística.** Quem escolhe o tier é a consciência do agente (`B-014`), não um modelo. Decidir como pensar não pode custar uma chamada.

**Contexto é comprimido na origem.** Opinião guarda um `stance` curto além da nuance; corpo entra como prosa de uma linha; relação entra como rótulo, não como tabela. O que só vai virar prosa no prompt é guardado do jeito mais barato que ainda gera aquela prosa.

**O que pode esperar, espera pelo lote.** Mecanismo que não precisa responder dentro do ciclo de decisão roda uma vez por agente por noite, junto dos outros; e quando lê o mesmo material que outro já lê, roda na mesma chamada que ele. É o que mantém o Crivo (`C-047`) e o auto-entendimento (`C-050`) fora do laço quente, e é a disciplina que decide onde um mecanismo novo mora antes de decidir como ele funciona.

---

## Pensamento

### C-001 — Ciclo de pensamento
`P0` · `V5` · PDF 74-79 · dep: A-001, B-014 · prompt: `agent.thought.base_low`, `agent.thought.base_high`, `agent.thought.reasoning`

O agente pensa em ciclos discretos. Cada ciclo monta contexto, escolhe profundidade, faz **uma** chamada e recebe de volta um monólogo interior mais uma decisão de ação, conforme `agent_thought_response`.

Não há chamada de roteamento antes nem chamada de tradução depois. O ciclo custa uma chamada de LLM, ou zero quando degradado por orçamento.

**Aceite:** um ciclo completo de pensamento consome exatamente uma chamada de LLM e produz `thought` e `decision` numa única resposta válida.

### C-002 — Contexto de pensamento
`P0` · `V5` · derivado de PDF 74-90 · dep: C-001, A-027, B-030

Bloco montado pela engine antes de cada pensamento: identidade, aparência, personalidade, corpo em prosa curta (`B-030`), necessidades salientes, rotina (`A-027`), função, metas correntes, opiniões filtradas (`C-030`), fatos salientes do banco (`C-054`), auto-entendimento (`C-050`), memórias recuperadas (`C-018`), inventário, relações comprimidas (`A-029`) e percepção corrente.

A rotina entra **sempre**, sem exceção, e o auto-entendimento entra sempre que existe — os dois são curtos e são o que ancora o agente justamente quando o resto do bloco foi omitido por saliência. O resto entra por saliência: o que não afeta a decisão corrente é omitido.

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

A consciência é **teto**, não carteira: ela decide o nível máximo que o agente alcança naquele ciclo, e é consultada antes de qualquer outra coisa. Quem paga a deliberação voluntária é o orçamento de `C-051`, e a ordem importa — se a consciência não permite deliberar, o orçamento nem é lido e nada é debitado de um agente que não teve como usar o que tinha.

**Aceite:** rebaixar a consciência de um agente muda o prompt escolhido sem nenhuma chamada de classificação, e agente em dor extrema nunca recebe o prompt de deliberação nem tem orçamento debitado.

### C-005 — Escalada para deliberação
`P1` · `V5` · decisão · dep: C-004, C-051

O pensamento corriqueiro pode levantar `meta.requestedDeepThinking`. A escalada é atendida **no ciclo seguinte**, não imediatamente: a decisão corrente já é válida e refazê-la gastaria duas chamadas para uma ação.

Adiar custa um compasso simulado e ganha qualidade — a deliberação acontece já com a consequência da ação rasa no contexto. Escalada levantada com consciência abaixo do limiar é descartada.

A bandeira só é **oferecida** quando o orçamento de pensamento profundo do agente tem saldo (`C-051`). Com orçamento zerado ou esgotado, o campo não aparece no contexto e o agente não tem como pedir; escalada que chegue assim mesmo é descartada sem chamada.

**Aceite:** levantar a bandeira agenda deliberação para o próximo ciclo do agente e não dispara segunda chamada no ciclo corrente.

### C-051 — Orçamento de pensamento profundo
`P0` · `V5` · decisão · dep: C-004, C-005, A-020

Por via de regra o agente decide e conversa com o modelo médio, sem raciocínio. Pensar mais profundamente, com o modelo mais forte, é opção dele, limitada por um orçamento que o agente carrega no estado — total, usado e início da janela — e que vale por um período de vários dias, não por dia, com o tamanho dimensionado pela inteligência da personalidade (`A-020`). Janela longa em vez de cota diária porque deliberação é recurso de crise: um agente que gasta as três deliberações da semana no dia em que o irmão morre está se comportando corretamente, e uma cota diária o impediria disso para lhe dar profundidade num dia em que não acontece nada.

Abaixo do limiar de inteligência declarado em `tuning.json` o total é **zero**, e nesse caso a opção não é oferecida: o campo de escalada não entra no contexto e o agente não tem como pedir o que não pode ter. Não oferecer é diferente de negar. Um agente que pede e é recusado todo ciclo produz um pedido desperdiçado por ciclo e um monólogo que fala de uma capacidade inexistente; um agente a quem nunca se ofereceu simplesmente age por impulso. O primeiro parece mal escrito, o segundo é um personagem limitado por incapacidade — que é exatamente o que se queria.

**Síntese com `C-004` e `C-005`.** A consciência limita a profundidade e a inteligência a orça. Consciência é teto: agente em agonia não delibera, tenha o orçamento que tiver. Inteligência é carteira: decide quantas vezes, dentro da janela, o agente pode gastar o modelo forte quando a consciência permite. As duas coexistem sem se sobrepor porque respondem a perguntas diferentes — uma diz até onde ele consegue ir agora, a outra diz quantas vezes ele pode ir. E nenhuma das duas custa chamada para ser decidida: uma lê capacidade derivada do corpo, a outra lê um contador.

O consumo é debitado quando a deliberação acontece, no ciclo seguinte, e não quando é pedida — escalada descartada por consciência baixa não gasta saldo. A janela reinicia por tempo simulado, e o gasto do agente é visível na inspeção, porque orçamento invisível é degradação silenciosa com outro nome (`L-006`).

**Aceite:** um agente com inteligência abaixo do limiar nunca recebe o campo de escalada no contexto e nunca produz deliberação; um agente acima do limiar delibera no máximo o total do orçamento dentro da janela, e a escalada seguinte é ignorada sem nenhuma chamada extra.

### C-006 — Decisão embutida
`P0` · `V5` · decisão · dep: C-001

A intenção sai no mesmo objeto do pensamento: `actionType`, alvo, destino, `intentDescription` em linguagem natural e fala opcional. Não existe passo separado de intenção.

A `intentDescription` é o que o Validador lê quando é chamado, e é o que o registro de atividade guarda quando não é.

**Aceite:** nenhum caminho do código emite uma segunda chamada para converter pensamento em ação.

### C-007 — Orçamento e degradação
`P0` · `V5` · decisão · dep: C-001, L-006

Cada agente tem teto de chamadas por dia simulado. Ao se aproximar do teto, gatilhos espontâneos e contemplativos são suprimidos primeiro; depois os agendados de baixa prioridade; reativos graves são os últimos a cair.

Ao estourar, o agente segue rotina e affordances sem LLM, e o fato é registrado como degradação visível no painel — nunca em silêncio.

O lote noturno tem teto próprio, declarado à parte em `tuning.json` e contabilizado à parte do teto de pensamento e conversa. Se disputasse o mesmo orçamento, o agente que passou o dia conversando chegaria à noite sem saldo e perderia a memória do dia, o Crivo e a apreciação das opiniões — ou seja, o dia inteiro custaria caro e não deixaria nada. O lote é o que preserva o estado que faz o agente existir amanhã, e por isso não compete com o dia de hoje.

**Aceite:** um agente que atinge o teto continua agindo por rotina, a degradação aparece no painel identificando qual agente e a partir de que hora simulada, e o lote noturno daquele agente roda mesmo assim, dentro do próprio teto.

### C-008 — Affordances no contexto
`P0` · `V4` · derivado de PDF 103-104 · dep: C-002, W-031

As ações suportadas pelos objetos e pelo ambiente ao alcance entram no contexto como lista curta. É o que ancora a decisão no que o mundo de fato oferece.

Affordance disponível resolve sem Validador (`W-031`); o contexto existe para que o agente escolha entre o que existe antes de inventar o que não existe.

**Aceite:** o contexto de pensamento lista as affordances ao alcance, e uma decisão que casa com uma delas não gera chamada de Validador.

### C-009 — Pensamento corrente exposto
`P1` · `V5` · PDF 88-90 · dep: C-001

O último monólogo interior fica acessível para inspeção na UI e para o balão de pensamento, sem custo adicional.

**Aceite:** selecionar um agente mostra o pensamento mais recente sem disparar chamada.

### C-010 — Registro de atividade
`P0` · `V5` · PDF 517-520 · dep: C-001

Log privado e determinístico do que o agente **de fato** fez: tempo, ação, alvo, setor, veredito e desfecho. Não passa por LLM e não é memória — é o fato contra o qual relato e mentira são comparados.

**Aceite:** toda ação resolvida, com ou sem Validador, gera entrada no registro, e o registro nunca é reescrito.

---

## Memória

### C-011 — Memória de curto prazo
`P0` · `V5` · PDF 91-95 · dep: C-010

Janela recente de impressões cruas disponível ao pensamento sem sumarização. Tem teto de itens e é descartada ao ser condensada na camada diária.

Entram aqui as impressões que cruzaram o limiar de lembrabilidade (`C-052`) e as que vêm de conversa e de reflexão. O que não cruzou o limiar não chega até aqui e não fica em lugar nenhum: quem guarda o que aconteceu de fato é o registro de atividade (`C-010`), que não é memória.

**Aceite:** o pensamento acessa eventos das últimas horas simuladas em texto bruto, a janela não cresce sem limite, e um instante de nota abaixo do limiar não aparece nela.

### C-012 — Cascata de memória
`P0` · `V5` · PDF 91-100 · dep: C-011

Condensação em degraus: curto prazo → diária → sazonal → longas. Cada degrau lê o de baixo, produz um resumo e libera o material consumido, exceto o que é marcante.

As camadas acima da anual existem na especificação e no schema, mas **não disparam** dentro do critério de pronto de `V7`, que são 30 dias simulados. Elas são validadas apenas em execução longa dedicada, e isso é deliberado: a estrutura é barata de manter e cara de retrofitar.

**Aceite:** um dia simulado completo produz uma memória diária e libera as impressões consumidas; uma estação produz uma sazonal.

### C-013 — Marcantes sobem intactos
`P0` · `V5` · PDF 96-98 · dep: C-012

Evento marcado como marcante atravessa todas as camadas sem ser reescrito. É o que impede que a sumarização apague o que define o agente.

O texto que sobe é o que o agente escreveu no instante em que viveu aquilo (`C-053`), e é isso que torna a promessa honesta: antes, "intacto" queria dizer intacto a partir da noite em que um modelo releu o dia e reescreveu o acontecimento com as próprias palavras. Agora quer dizer intacto desde a hora.

**Aceite:** um evento marcante do dia 1 aparece com o mesmo texto na memória sazonal, e esse texto é o mesmo que a resposta de pensamento produziu no dia 1.

### C-052 — Limiar de lembrabilidade
`P0` · `V5` · decisão · dep: C-053, B-014, A-020

A engine compara a nota de `C-053` a um limiar derivado da consciência corrente (`B-014`) e do traço de atenção da personalidade (`A-020`), com pesos declarados em `tuning.json`. Acima do limiar, o fato escrito pelo agente vira impressão e entra na janela de curto prazo (`C-011`). Abaixo, nada acontece: o instante se perde.

Perder o instante é o comportamento correto, não uma perda de dado. Um agente que retém tudo não tem memória, tem log — e paga por isso duas vezes, no token de todo contexto montado dali em diante e na indistinção entre o que importa e o que não importa. A comparação é determinística e não custa chamada nenhuma.

Consciência baixa **eleva** o limiar: quem está exausto, febril ou ferido registra menos do que viveu, e depois não sabe dizer o que aconteceu naquela noite. Atenção alta **abaixa** o limiar: quem presta atenção retém o que passa batido pelos outros. As duas juntas produzem duas testemunhas do mesmo acontecimento com memórias diferentes dele — sem chamada extra, sem sistema de percepção seletiva e sem uma linha de regra escrita para o caso.

**Aceite:** o mesmo evento com a mesma nota é retido por um agente atento e descartado por um agente exausto, e nenhuma chamada de LLM participa da decisão.

### C-053 — Nota de lembrabilidade
`P0` · `V5` · decisão · dep: C-001, C-006

Na mesma resposta que traz pensamento e decisão, o modelo avalia de 0 a 10 o quanto aquele instante o marcou e escreve o fato numa frase, em primeira pessoa. Os dois viajam no campo `memorability` de `agent_thought_response`. Custa **zero chamada**: é campo de uma resposta que já existe, não requisição nova.

Quem pontua é o agente, na hora, com o próprio contexto na frente. É a diferença entre perguntar a alguém o que o marcou hoje e perguntar o que, relendo a agenda, parece ter sido importante — e a primeira pergunta é a que produz o agente que guarda uma frase banal dita por quem ele ama e esquece a assembleia que mudou a lei da comunidade.

Sinalização externa não decide. O candidato a marcante emitido pela mediação de ação entra como insumo do contexto e **eleva** a nota, sem determiná-la: um desfecho objetivamente grave acontecido com um estranho pode legitimamente não marcar quem passou por perto. Nota ausente na resposta é lida como zero e o instante se perde — pedir de novo custaria exatamente o que este desenho existe para não custar.

**Aceite:** uma resposta de pensamento válida carrega nota e fato numa frase sem nenhuma chamada adicional, e uma resposta sem o campo é tratada como nota zero em vez de disparar repetição.

### C-014 — Seleção de marcantes
`P0` · `V5` · PDF 96-98 · dep: C-013, C-052

Ao fim do dia, os marcantes são eleitos **deterministicamente** sobre as notas já registradas: entram os instantes cuja nota cruzou o corte declarado em `tuning.json`, do maior para o menor, até o teto diário. Zero continua sendo resultado válido e comum — a maioria dos dias não marca ninguém — e agora zero não custa nada, porque a eleição inteira não passa por LLM.

Era uma chamada por agente por noite, e deixou de ser por dois motivos. O primeiro é custo: pagava-se um modelo para reordenar informação que o agente já tinha produzido de graça. O segundo vale mais, e é psicológico: o que fica de um dia não é o que se julga importante ao fim dele, é o que atingiu na hora. Um modelo relendo o registro elege o que parece narrativamente relevante, e o resultado é um agente cuja memória tem curadoria — todo dia sobra exatamente o que daria uma boa cena. Marcar no instante elege o que pegou o agente desprevenido, que é como memória funciona e é o que produz surpresa em vez de roteiro.

A intensidade deixa de ser campo pedido a modelo: a própria nota ordena os marcantes e é preservada junto da memória, e as faixas que a traduzem em impacto, quando a interface precisa de impacto, ficam em `tuning.json`.

**Aceite:** um dia sem nenhuma nota acima do corte produz lista vazia, sem erro de validação e sem nenhuma chamada de LLM; e duas execuções com as mesmas notas elegem exatamente os mesmos marcantes.

### C-015 — Resumo diário
`P0` · `V5` · PDF 91-95 · dep: C-012, C-014 · prompt: `memory.daily_summary`

Lote noturno que condensa registro de atividade e impressões do dia num resumo atemporal.

Os marcantes chegam já eleitos e determinados (`C-014`): o resumo não os escolhe, não os reordena e não os reescreve — recebe a lista e a preserva. Foi essa confusão de papéis que fazia a mesma tarefa ser paga duas vezes, uma na seleção e outra na condensação.

**Aceite:** ao virar o dia, cada agente desperto ganha exatamente uma memória diária, e os marcantes do dia aparecem nela com o texto que já tinham.

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

O classificador tem duas cadências. A quente roda logo após a conversa (`S-014`), porque a ruptura de opinião precisa poder acontecer no mesmo dia em que a conversa aconteceu. A noturna roda uma vez, sobre o que sobrou do dia e sobre as impressões que a reflexão (`C-031`) acabou de produzir — e essa passagem noturna é **a mesma chamada** do Crivo (`C-047`), porque as duas leem o mesmo material contra o mesmo contexto pessoal.

**Aceite:** uma conversa com seis impressões e vinte opiniões relevantes consome uma chamada, não cento e vinte; e a passagem noturna não acrescenta chamada além da apreciação já prevista no lote.

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

Roda **antes** da apreciação noturna (`C-047`), e as impressões que produz entram nela junto com as do dia. Assim a reflexão não precisa de passagem de classificação própria, e a ordem do lote fica sendo a ordem de consumo: reflexão, apreciação, marcantes e resumo diário, cada um lendo o produto do anterior.

**Aceite:** uma noite produz um lote de impressões gerais e, quando cabível, candidatas a opinião nova; e essas impressões são classificadas na mesma chamada de apreciação que já roda naquela noite.

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

## O Crivo e o banco de fatos

Memória é o que o agente viveu. Opinião é o que ele acha. Falta a terceira coisa: o que ele tem por verdade sobre o mundo sem ter visto — quase tudo que uma pessoa sabe, e tudo que ela sabe errado. É o que esta seção especifica, junto do filtro que decide o que dos boatos do dia vira crença.

### C-047 — O Crivo
`P0` · `V6` · decisão · dep: C-025, C-011, S-012

Tudo o que o agente ouviu no período é destrinchado em temas, e cada tema recebe um veredito à luz do contexto pessoal e do **texto original** da interação, conforme `SieveVerdict` e `sieve_response`: verdadeiro, possível, desinteressante, ignorado ou falso.

Verdadeiro entra no banco de fatos (`C-048`). Possível fica em suspenso, fora do banco como verdade, e pode ser promovido depois por corroboração (`C-049`). Falso vai para a memória de mentiras ouvidas (`C-055`). Desinteressante e ignorado são ambos descartados, e o sistema faz com os dois exatamente a mesma coisa: nada. A distinção entre eles é **caracterização, não filtro** — o primeiro é o tema que não pegou, o segundo é o tema que o agente decidiu não acolher —, e existe porque o motivo registrado em `reason` é o que depois explica, na inspeção e no export narrativo, por que aquele indivíduo não sabe de uma coisa que lhe disseram na cara. Vale dizer isto explicitamente para que ninguém depois tente derivar comportamento da diferença: não há comportamento a derivar, há personagem a ler.

O Crivo lê a fala como foi dita, não o resumo dela. Julgar "ele disse que o poço secou" contra esta memória e esta personalidade exige a frase original; a partir do resumo, o julgamento passa a ser sobre o resumo, e o que o agente acaba acreditando é o que o sumarizador achou que valia contar.

**Cadência: uma vez por agente por noite, no lote.** Por tema seria o pior perfil de volume possível do sistema — uma conversa de cinco turnos rende dezenas de temas — e por conversa seria o segundo pior. Não há nada no Crivo que precise responder dentro do ciclo de decisão: acreditar em algo que se ouviu de manhã só precisa estar valendo amanhã.

**Uma chamada, não duas.** O Crivo e a passagem noturna do classificador de dissonância (`C-025`) leem o mesmo material — as impressões e as falas do dia — contra o mesmo contexto pessoal, e por isso são a mesma chamada, com uma resposta que traz as duas listas: as classificações de `dissonance_classification_response` e os vereditos de `sieve_response`. Essa chamada fundida é a **apreciação noturna**, e é assim que o resto do documento a nomeia. Mantê-las separadas custaria uma chamada por agente por noite apenas para renderizar duas vezes o mesmo contexto, que é precisamente o gasto que este documento existe para não ter. A passagem a quente do classificador, logo depois da conversa, continua separada e continua só classificando: o Crivo não roda por evento.

O recuo, se a chamada fundida se mostrar instável no tier mais barato — duas tarefas estruturalmente distintas numa resposta é o que modelo pequeno erra primeiro (`L-019`) —, é separá-la de novo, ao custo de uma chamada por agente por noite. Fica declarado aqui para que a decisão de recuar seja medida contra um número conhecido, e não tomada por sensação.

**Aceite:** uma noite produz no máximo uma apreciação por agente, cobrindo Crivo e classificação; um tema julgado possível não aparece no banco de fatos como verdade; e um tema julgado ignorado é descartado com motivo legível na inspeção.

### C-048 — Banco de fatos
`P0` · `V6` · decisão · dep: C-047

Conforme `FactBankEntry`. O que o indivíduo tem por verdade sobre o mundo, distinto de memória — o que ele viveu — e de opinião — o que ele acha. Cada entrada guarda o fato numa frase afirmativa, o tópico, o veredito que a colocou ali, de quem veio, a confiança e o momento.

Um fato do banco **pode ser falso**, e o sistema não tem nem quer ter como saber. Não existe oráculo conferindo o banco contra o estado do mundo. O que importa é que o agente acredita, porque é sobre a crença que ele age: é daí que sai o agente que caminha três dias até um poço seco porque alguém lhe disse, com convicção, que havia água ali — e é daí que sai a consequência social de ter sido esse alguém.

Fato não tem buffer nem limiar de teimosia; não é opinião e não vai virar uma. A ponte entre os dois é a colisão: quando entra um fato que contradiz outro já guardado, os dois ficam ligados por `contradictedByFactId` e a contradição vira impressão como qualquer outra, indo parar no classificador (`C-025`) pelo caminho normal, contra as opiniões que o tópico alcança. O banco não inventa mecanismo próprio de mudança de crença — alimenta o que já existe, que é a única razão de ele caber neste documento sem custar chamada nova.

**Aceite:** um fato entra no banco por veredito verdadeiro do Crivo e é serializado e restaurado sem perda de campo; e dois fatos contraditórios produzem impressão de conflito sem nenhum caminho de código próprio de ruptura.

### C-049 — Corroboração sem chamada
`P1` · `V6` · derivado · dep: C-048

Tema julgado possível fica em suspenso com `corroborationCount` em zero. Cada vez que uma fonte independente afirma o mesmo tema, a engine incrementa o contador — casamento determinístico de tópico e alvo, sem LLM. Ao cruzar o número de fontes declarado em `tuning.json`, o tema é promovido a verdadeiro e entra no banco **sem nenhuma chamada nova**. É para isso que o contador existe: promover por releitura significaria pagar um modelo para reconhecer uma frase que ele já tinha julgado uma vez.

Fonte **independente** é o ponto. Duas afirmações do mesmo agente contam uma. Sem essa regra, o mais falante da comunidade vira a fonte de verdade de todo mundo por repetição, e o boato mais insistente vence o boato mais corroborado.

Possível que nunca é corroborado expira pelo prazo declarado em `tuning.json` e some sem virar nada. Suspenso eterno é vazamento de estado com aparência de cautela.

**Aceite:** duas fontes distintas afirmando o mesmo tema promovem um possível a verdadeiro sem chamada de LLM; a mesma fonte repetindo o tema não promove nada.

### C-054 — Banco de fatos no contexto
`P1` · `V6` · derivado · dep: C-048, C-002, C-033

O banco entra no contexto de pensamento por saliência e comprimido, pela mesma disciplina das opiniões: entram os fatos cujo tópico intersecta o gatilho corrente e as entidades presentes, ordenados por relevância ao tópico, confiança e recência, até o teto de itens e de tokens declarados em `tuning.json`. O excedente vira **uma linha agregada**, como em `C-033` — nunca é descartado em silêncio, e nada sai do estado do agente.

Sem teto, o banco seria a única estrutura do agente que cresce a cada noite de conversa e nunca é condensada por camada nenhuma, e portanto a primeira a estourar o orçamento de contexto numa execução de trinta dias simulados. Opinião tem cascata e consolidação; memória tem cascata; fato não tem nem terá, porque condensar fatos os transformaria em resumo, e resumo de fato é opinião.

**Aceite:** um agente com o banco acima do teto produz bloco no teto mais uma linha agregada, a montagem é determinística entre execuções, e nenhum fato é apagado do estado.

### C-055 — Mentira ouvida
`P1` · `V6` · derivado · dep: C-047, C-019

Tema julgado falso não é jogado fora: fica no banco com o veredito de falso e com quem o disse. Não é o que o agente tem por verdade sobre o mundo — é o que ele tem por verdade sobre o que lhe contaram.

Guardar isso é o que fecha o ciclo que `C-019` e `C-020` abrem. Um relato divergente do registro só vira acontecimento social se alguém tiver retido que ouviu aquilo; retido, ele volta como impressão contra a opinião social sobre quem falou, pelo caminho normal de `C-025`. É o que permite confrontar a versão depois — e é também o que permite o desfecho mais comum e mais interessante, que é não confrontar nada e simplesmente passar a desconfiar sem saber dizer bem por quê.

Julgar falso não exige prova. Basta o tema colidir com o que o agente já tem por verdade ou com quem ele é. Ele pode estar errado: um agente teimoso registra como mentira a informação correta que contraria sua crença, e passa a desconfiar de quem lhe disse a verdade. Isso é comportamento desejado, não defeito, e é exatamente o tipo de coisa que nenhum roteiro produziria sem parecer forçado.

**Aceite:** uma fala julgada falsa é retida com o autor identificado e alimenta impressão contra a opinião social sobre ele, sem nenhuma chamada além da apreciação noturna que já a julgou.

---

## Teoria de si

### C-050 — Auto-entendimento
`P1` · `V7` · decisão · dep: C-012, A-020

Conforme `SelfUnderstanding`. Prosa curta em primeira pessoa sobre como o indivíduo se vê e como acha que deve responder a cada tipo de situação, gerada a partir das memórias recentes, da personalidade e dos auto-entendimentos anteriores, e devolvida em `self_understanding_response`.

É a única peça do desenho que dá ao agente uma teoria sobre si mesmo. Todo o resto que ele carrega aponta para fora: opinião é sobre um alvo, fato é sobre o mundo, meta é sobre o futuro, memória é sobre o que houve. Sem isto, o agente é coerente por fora — os traços não mudam, o tom se mantém — mas não tem como se explicar, se contradizer nem se surpreender consigo, e é nesses três lugares que personagem acontece.

Como deriva do próprio passado, deriva junto com o personagem: o agente que passou uma estação cedendo se descreve, na geração seguinte, como alguém que cede — e a partir daí cede um pouco mais, porque o texto entra no contexto de pensamento e de fala. O ciclo é intencional, e é a versão barata da deriva de personalidade (`A-021`), que mexe em número e é cara.

A versão anterior é preservada por uma geração em `supersedesText`. Comparar as duas é o que torna a mudança de caráter legível na inspeção e no export narrativo (`U-026`): sem isso a deriva acontece e ninguém vê, que é o mesmo que não acontecer para quem está observando. Quando nada mudou, a resposta diz isso em `changedFromPrevious` e o texto anterior permanece sem gravar versão nova — a maioria das gerações não muda nada, e uma linha do tempo cheia de mudanças que não mudaram nada é ruído.

**Cadência: uma chamada por período longo**, declarado em dias simulados em `tuning.json`, sempre no lote noturno e nunca dentro de um ciclo de decisão. É o mecanismo mais caro desta seção e ainda assim o mais barato do documento por unidade de tempo simulado, porque um período de dias absorve o custo de uma chamada até ele desaparecer da conta.

**Aceite:** um agente ganha auto-entendimento novo na cadência declarada e no máximo uma vez por período; a versão anterior continua legível por uma geração; e a geração acontece em lote, nunca dentro de um ciclo de decisão.

### C-056 — Cartela de voz
`P1` · `V3` · decisão · dep: A-030, A-020 · prompt: `generation.agent_profile`

Junto com a personalidade, a geração do perfil produz uma cartela de perguntas variadas com a resposta típica daquele indivíduo a cada uma: o que ele diz sobre o próprio trabalho, sobre um desconhecido que chega, sobre um pedido de ajuda, sobre uma acusação, sobre o passado dele. Não são falas de uma cena — são o registro de voz da pessoa, escrito de uma vez para servir de âncora.

O custo é a razão de ela existir onde existe. Sai na mesma chamada que já cria o perfil e nunca mais é regenerada, então o custo marginal em jogo é zero. O retorno é consistência de voz nos prompts de fala, que é onde persona escapa primeiro: o mesmo agente soando cerimonioso num turno e debochado no seguinte é a falha mais visível deste projeto e a mais barata de evitar, porque exemplo de voz ensina o modelo em três linhas o que ficha de traços não ensina em vinte.

Um subconjunto da cartela entra no contexto dos prompts de fala — `social.conversation_turn` e `community.meeting_turn` —, escolhido por proximidade entre a pergunta e a situação corrente, com o número de perguntas declarado em `tuning.json`. A cartela inteira num turno gastaria em exemplo o orçamento de que o turno precisa para o assunto.

A cartela não deriva. Quando o caráter muda, quem muda é a personalidade (`A-021`) e o auto-entendimento (`C-050`); a cartela permanece como estava e é editável pelo usuário, como a ficha de traços. Uma cartela que se reescrevesse sozinha custaria chamada e desfaria exatamente a âncora que ela existe para ser.

**Aceite:** gerar um perfil produz a cartela na mesma chamada; um turno de conversa recebe o subconjunto declarado e não a cartela inteira; e nenhuma chamada em jogo a regenera.

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

## Fronteira com o Validador

O Validador não escreve na cognição. Ele produz fatos e vereditos; a cognição os interpreta.

Uma negação do Validador entra como impressão comum e pode virar dissonância — é assim que um agente frustrado repetidamente muda de crença sobre o que é possível no mundo. O Validador nunca reescreve opinião, meta ou memória diretamente.

A exceção é a promoção de regra no domínio `cognition`, especificada em [SPEC-V](SPEC-V-validador.md): o Validador pode propor que um tópico passe a produzir um `stance` de forma determinística, e essa regra é revisável no painel como qualquer outra.

### C-046 — Tentativa frustrada
`P1` · `V5` · derivado · dep: C-003, C-022, V-006, V-036

Uma ação que não se materializou entra na cognição como impressão comum, com `sourceType` de negação, carregando o que foi tentado e o retorno diegético que o agente recebeu — nunca o motivo de sistema, que ele não tem como conhecer. Ela dispara um pensamento de gatilho `postDenial`.

Vale ter requisito próprio, e não ficar implícita na impressão genérica, por causa do que a repetição faz. Uma frustração isolada é ruído. Frustrações repetidas sobre o mesmo tema são o único caminho pelo qual um agente **corrige a própria crença sobre o que é possível neste mundo** — e como ele não tem acesso às regras, é a única forma de aprendizado sobre física e sobre limite que o desenho oferece. Sem o gatilho, o agente tenta a mesma coisa impossível para sempre e nunca fica mais esperto; com ele, a teimosia vira personagem, porque quem insiste depois de aprender está insistindo de verdade.

Nos domínios de porteiro, a sequência inteira de `V-036` — tentativa, motivo, nova tentativa, até esgotar — entra como **uma** impressão, e não uma por tentativa. O que frustra é ter batido na parede, não quantas vezes se bateu no mesmo instante.

A tentativa frustrada é insumo do Crivo e da dissonância pelo caminho normal, sem tratamento especial: se ela contradiz uma opinião sobre a própria competência, é a dissonância que resolve.

**Aceite:** uma ação negada produz exatamente uma impressão com o retorno diegético e nenhum vocabulário de sistema, e dispara um pensamento `postDenial`; uma negação em domínio de porteiro que consumiu três tentativas produz também exatamente uma impressão.

---

## Não-objetivos

**Emoções como sistema numérico.** Emoção é campo de texto no pensamento e tom na conversa. Não há vetor de humor com decaimento.

**Teoria da mente explícita.** O agente não modela o que o outro acredita. Ele tem opinião sobre o outro, registra de quem ouviu cada coisa (`C-048`) e guarda o que julgou mentira (`C-055`) — e nenhuma das três é um modelo do estado mental alheio, são registros do que chegou até ele. A exceção deliberada é sobre si mesmo: o auto-entendimento (`C-050`) é uma teoria que o agente tem da própria pessoa, e existe porque mudança de caráter que ninguém consegue ler é mudança que, para o observador, não aconteceu.

**Verificação de verdade.** Nada confere o banco de fatos contra o estado do mundo. Um fato falso pode entrar, ser corroborado por duas testemunhas igualmente enganadas e permanecer para sempre. Não há oráculo, e não haverá: a crença errada agindo sobre o mundo é metade do comportamento que justifica o projeto.

**Releitura do dia para decidir o que ficou.** A eleição de marcantes é determinística sobre notas dadas no instante (`C-014`). Reintroduzir uma chamada noturna que relê o dia e escolhe o que importou seria pagar por curadoria narrativa e chamar isso de memória — é regressão, não melhoria, mesmo que o texto resultante pareça melhor.

**Planejamento hierárquico com busca.** Metas são texto que orienta o modelo, não árvore de tarefas resolvida por planejador.

**Aprendizado entre execuções.** Nada persiste de uma partida para outra.
