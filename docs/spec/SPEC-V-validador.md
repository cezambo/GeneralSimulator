# SPEC-V — Validador

O mediador invisível. Interpreta a intenção que o pensamento produziu, determina o que acontece e altera o mundo para corresponder.

O substrato que ele **não** precisa simular está em [SPEC-R](SPEC-R-substrato.md); a fronteira biológica equivalente está em [SPEC-B](SPEC-B-corpo.md). A mente cuja intenção ele recebe está em [SPEC-C](SPEC-C-cognicao.md). Os objetos cujo funcionamento ele consulta e amplia estão em [SPEC-O](SPEC-O-objetos.md).

> Este documento substitui `SPEC-G-gm.md`. Os identificadores foram transpostos um a um: `G-001` virou `V-001`, `G-034` virou `V-034`, e nada foi renumerado no caminho. Os requisitos `V-035` em diante são novos.

---

## A tese

O Validador existe porque nenhuma engine consegue enumerar antecipadamente tudo que uma pessoa pode inventar de fazer. Ele não é porteiro geral nem juiz moral: é a fonte de **causação nova** e a **calculadora de consequência**.

Essas são duas funções, e vale separá-las desde já porque elas têm posturas opostas. Como fonte de causação nova, ele é permissivo: diante de um método improvisado plausível, materializa. Como calculadora de consequência, ele é frio: enumera desfechos e estima probabilidade, e quem sorteia é a engine.

Existe uma terceira função, e ela é a exceção: em domínios declarados pelo cenário — e só neles — ele **barra**, e o agente é convidado a tentar outra coisa sabendo por que a primeira não deu. Fora desses domínios, negar é último recurso e é final.

Isso define o documento por subtração. Quanto mais a engine resolve sozinha, menos o Validador é chamado, e cada regra que ele promove é uma chamada que deixa de existir para sempre. Um validador bem projetado fica progressivamente mais barato ao longo de uma partida.

---

## Papel e fronteira

### V-001 — Mediador invisível
`P0` · `V4` · PDF 82-87 · dep: C-006 · prompt: `gm.evaluate_high`

O Validador recebe intenção em linguagem natural mais contexto, e devolve veredito, raciocínio, narrativa, mutações, consequências e retorno diegético. Os agentes não sabem que ele existe e nunca falam com ele.

Há **um** prompt de mediação. Não existe caminho rápido nem caminho lento: existe o caminho determinístico da engine e existe o Validador.

**Aceite:** nenhum texto que chega a um agente revela a existência do Validador, e o sistema tem exatamente um prompt de mediação.

### V-002 — Affordance-first
`P0` · `V4` · decisão · dep: W-031, C-008

Se a `actionType` da intenção casa com uma affordance declarada do alvo e a proximidade já foi validada (`A-010`), a engine executa **sem chamada de LLM**, com retorno diegético por template.

Chamar um modelo para autorizar sentar numa cadeira seria a chamada de maior volume e menor retorno do sistema. O Validador só entra quando a intenção não encontra affordance — que é exatamente o caso interessante.

**Aceite:** sentar, pegar item visível, abrir porta destrancada, comer e largar item geram zero invocação de Validador.

### V-003 — Postura permissiva
`P0` · `V4` · PDF 82-87 · dep: V-001

Fora dos domínios de porteiro de `V-035`, a postura padrão é materializar. Diante de uma ação improvável, o Validador prefere executar com custo, ou reinterpretar, antes de negar.

Isso substitui a aprovação binária do documento original e é o que permite ao agente tentar qualquer coisa.

**Aceite:** numa amostra de ações implausíveis fora de domínio de porteiro, a proporção de `denied` é minoritária.

### V-004 — Hierarquia de veredito
`P0` · `V4` · PDF 82-87 · dep: V-003

Quatro vereditos em ordem de preferência: `executed`, `partial`, `reinterpreted`, `denied`. A negação é último recurso, reservada a instrução do usuário, lei inviolável, domínio de porteiro declarado, ou impossibilidade total sem adaptação.

**Aceite:** cada veredito é produzido pelo menos uma vez numa bateria de ações variadas, e `denied` sempre nomeia o domínio que o justificou.

### V-005 — Mutação de mundo
`P0` · `V4` · PDF 82-87 · dep: V-004

Conforme `WorldMutation`. Toda resposta lista alterações concretas de estado com tipo, alvo e campos alterados. Narrativa sem mutação não altera nada.

Mutação listada aqui é **certa**: acontece sem sorteio. O que é incerto vai para as consequências de `V-038`.

**Aceite:** um veredito `executed` que descreve mudança física sem emitir mutação correspondente é rejeitado na validação.

### V-006 — Retorno diegético
`P0` · `V4` · PDF 82-87 · dep: V-004

O agente nunca vê linguagem de sistema. Recebe sensação, percepção e consequência: não "ação inválida", mas "a maçaneta não cede".

**Aceite:** nenhum retorno ao agente contém vocabulário de sistema, código de erro ou menção a regra.

### V-007 — O Validador não simula física
`P0` · `V4` · decisão · dep: R-044, B-043

Quando a ação tem caminho causal já modelado — encostar, arremessar, derrubar, mergulhar, pisar em, esfaquear, cair — o Validador apenas autoriza e para. A engine faz o resto.

Emitir efeito que a matriz já produziria aplica tudo duas vezes.

**Aceite:** arremessar objeto aceso em material inflamável produz zero `engine_effect`; esfaquear alguém produz zero `apply_condition`.

### V-008 — Causação nova
`P0` · `V4` · decisão · dep: V-007, R-043

O território exclusivo do Validador é criar estado que nenhuma regra sabia produzir. A matriz sabe o que acontece dado que um estado existe; ela não enumera as maneiras de uma pessoa inventar de criá-lo.

Esfregar gravetos até pegar fogo é caso do Validador. Arremessar tocha em palha não é.

**Aceite:** um método improvisado plausível que nenhuma regra cobre produz `engine_effect` com justificativa; um método já coberto não produz.

---

## Contexto exposto ao Validador

### V-009 — Instantâneo do substrato
`P0` · `V4` · derivado de R-041 · dep: R-041

Materiais, etiquetas, estados ativos, coberturas, temperatura, integridade e o vocabulário de efeitos invocáveis no escopo da ação.

**Aceite:** o prompt contém os efeitos que o Validador pode invocar, e nenhum efeito fora dessa lista é aceito na resposta.

### V-010 — Resumo da matriz
`P0` · `V4` · derivado de R-042 · dep: R-042, V-007

Descrição em linguagem natural do que a engine já resolve sozinha naquele escopo. É o que permite ao Validador saber quando **não** agir.

**Aceite:** remover o resumo do prompt aumenta mensuravelmente a taxa de efeitos duplicados.

### V-011 — Exposição do corpo
`P0` · `V5` · derivado de B-034 · dep: B-034

Árvore de partes com material corrente, condições, capacidades derivadas e operações biológicas invocáveis, para os corpos em escopo.

O corpo entra pelo mesmo canal do substrato, no mesmo formato, porque é o mesmo catálogo de materiais.

**Aceite:** o prompt descreve os corpos presentes com o mesmo vocabulário que descreve tiles e objetos.

### V-012 — Resumo da matriz de lesão
`P0` · `V5` · derivado de B-035 · dep: B-035, V-007

O equivalente biológico do resumo da matriz: o que a lesão já resolve sozinha, para faca, queda, fogo, frio, corrosivo e veneno.

**Aceite:** o resumo de lesão tem o mesmo peso e o mesmo lugar no prompt que o resumo da matriz.

### V-013 — Causa contra derivado
`P0` · `V5` · decisão · dep: B-036, V-005

O Validador escreve **causas**: condição, material de parte, presença de parte, substância. Nunca escreve valores derivados: capacidade, dor total, sangue total, temperatura corporal, estado de vida.

O motivo imediato é que escrever em campo derivado é apagado no recálculo seguinte. O efeito colateral é melhor que o motivo: para matar alguém, ele precisa destruir uma parte vital, então morte narrativa nasce com a mesma cadeia causal auditável de qualquer outra.

**Aceite:** a validação de mutações rejeita qualquer caminho marcado como derivado no schema.

### V-014 — Leis invioláveis
`P0` · `V4` · PDF 82-87 · dep: V-004

Regras do cenário que o Validador não contorna, declaradas na geração e presentes em todo prompt de mediação. São uma das causas legítimas de negação.

**Aceite:** uma ação que viola lei inviolável é negada com referência à lei.

### V-015 — Instruções do usuário
`P0` · `V4` · PDF 82-87 · dep: V-004

Orientações do usuário têm prioridade máxima sobre o julgamento do Validador e aparecem no topo do prompt.

**Aceite:** uma instrução do usuário que proíbe algo prevalece sobre a postura permissiva.

### V-016 — Registro de plausibilidade
`P0` · `V5` · derivado de B-044 · dep: B-044

Conforme `PlausibilityRegistry`. O cenário declara quais operações o Validador pode escolher. A engine sempre suporta transmutar ossos; é o cenário que diz se este mundo permite. Vilarejo comum não permite; cenário exótico permite.

Sem isso, o modelo julgaria o gênero do mundo a cada chamada, e deriva tonal é o modo de falha mais difícil de recuperar num mediador de LLM.

**Aceite:** com o registro padrão, uma operação não autorizada é rejeitada antes de tocar o estado.

---

## Percepção e registro

### V-017 — Testemunhas
`P0` · `V4` · derivado de PDF 82-87 · dep: R-034, A-007

A resposta declara quem percebeu o evento e por qual sentido. Fumaça densa, escuridão e parede bloqueiam. Se ninguém viu, ninguém viu.

**Aceite:** um evento atrás de parede não gera testemunha, e um evento em cômodo iluminado gera testemunha para cada agente presente com linha de visão.

### V-018 — Proporcionalidade e impersonalidade
`P1` · `V4` · PDF 82-87 · dep: V-004

A consequência corresponde à ação e ao contexto, nem mais nem menos. O Validador não tem opinião, emoção nem favoritismo: o mundo reage física e socialmente, não eticamente.

**Aceite:** numa amostra, ações moralmente carregadas não recebem consequência desproporcional à sua materialidade.

### V-019 — Candidato a marcante
`P1` · `V5` · derivado · dep: V-004, C-053

O Validador sinaliza quando um desfecho é forte candidato a memória marcante — falha crítica em momento de vida ou morte, perda irreversível, violência presenciada.

É sinalização, não decisão: quem pontua o quanto o instante marcou é o próprio agente, na nota de lembrabilidade de `C-053`. A sinalização entra como insumo dessa nota, elevando-a sem forçá-la.

**Aceite:** um desfecho letal ou mutilante é sinalizado, e a sinalização eleva a nota do agente sem determiná-la.

### V-020 — Justificativa auditável
`P0` · `V4` · decisão · dep: V-005

Toda mutação carrega justificativa. Em `engine_effect`, a justificativa precisa explicar **por que nenhuma regra existente cobria o caso**.

É o que torna a duplicação detectável em auditoria em vez de invisível.

**Aceite:** um `engine_effect` sem justificativa que cite a lacuna é rejeitado na validação.

---

## Promoção de regra

### V-021 — Promoção generalizada
`P0` · `V4` · decisão · dep: V-008, R-046, B-045

Ao invocar causação nova, o Validador decide também se aquele julgamento **generaliza**: se o método deve virar regra sistêmica acionável por parâmetros do jogo sem LLM, ou se foi caso a caso.

É o mecanismo que faz o custo cair ao longo da partida em vez de ficar constante.

**Aceite:** toda resposta que invoca causação nova traz veredito de generalização preenchido.

### V-022 — Vocabulário fechado por domínio
`P0` · `V4` · decisão · dep: V-021

A regra proposta precisa ser expressável no vocabulário fechado do domínio que ela toca:

| Domínio | Forma da regra |
|---------|----------------|
| `substrate` | ocasião, condições em etiquetas, efeito nomeado, chance |
| `body` | operação, condição, seletor de parte |
| `social` | template de fato perceptível, viés de relação |
| `cognition` | tópico, `stance` resultante |
| `community` | template de norma, alvo mecânico permitido |

O Validador nunca inventa primitiva nova de engine. Ele apenas combina as que existem.

**Aceite:** uma regra que cita efeito, operação ou alvo fora do vocabulário do seu domínio é rejeitada.

### V-023 — Queda forçada para caso único
`P0` · `V4` · decisão · dep: V-022

Se o julgamento não é expressável no vocabulário fechado nem em molde de fórmula (`V-040`), o veredito é **forçado** a caso único. Não há caminho pelo qual uma regra malformada entre na matriz.

**Aceite:** uma proposta que falha a validação de vocabulário é convertida em caso único e registrada como tal, sem erro de execução.

### V-024 — Regra provisória entra viva
`P0` · `V4` · decisão · dep: V-022

A regra aprovada na validação passa a valer **imediatamente**, marcada com autoria, momento e julgamento de origem, e registrada no log causal.

Entrar viva na hora é o ponto: é isso que poupa as rechamadas. Uma fila de aprovação humana antes da ativação devolveria o custo que o mecanismo existe para eliminar.

**Aceite:** o mesmo método improvisado, repetido logo em seguida, resolve pela regra provisória sem nova chamada.

### V-025 — Ciclo de vida da regra
`P1` · `V4` · decisão · dep: V-024

Quatro estados: proposta, provisória, permanente, rejeitada. O humano promove ou rejeita no painel. Rejeitar desativa a regra dali em diante, mas **não** desfaz os efeitos já causados por ela — o passado da simulação é imutável.

**Aceite:** rejeitar uma regra provisória impede disparos futuros e preserva o estado que ela já produziu.

### V-026 — Não-duplicação imediata
`P0` · `V4` · decisão · dep: V-024, R-044

Uma regra provisória recém-criada passa a contar para a proibição de duplicação no mesmo instante em que nasce, e entra no resumo da matriz (`V-010`) do próximo prompt.

Sem isso, o Validador continuaria sendo chamado para o caso que ele mesmo acabou de resolver.

**Aceite:** após promover uma regra, o resumo da matriz do próximo prompt já a menciona.

### V-027 — Salvaguardas
`P1` · `V4` · decisão · dep: V-024

Teto de regras provisórias vivas simultaneamente; detecção de regra que dispara com frequência anômala; e conflito entre provisória e permanente resolvido sempre a favor da permanente.

**Aceite:** ultrapassar o teto impede novas promoções até que alguma seja revisada, e uma provisória que contradiz uma permanente nunca prevalece.

### V-028 — Dívida de matriz
`P1` · `V4` · derivado de R-045 · dep: V-021

Invocação recorrente do mesmo método é dívida: sinal de que falta regra determinística. O painel lista os métodos mais invocados que ainda não viraram regra.

É o único item de observabilidade do projeto que se paga em dinheiro.

**Aceite:** o mesmo método invocado três vezes sem promoção aparece no topo da lista de dívida.

---

## Operação

### V-029 — Trilha de auditoria
`P1` · `V4` · derivado · dep: V-020

Toda invocação registra intenção recebida, contexto enviado, resposta bruta, raciocínio, rolagens efetuadas com a semente usada, mutações aplicadas e mutações rejeitadas.

**Aceite:** qualquer evento do mundo pode ser rastreado até a invocação que o causou, ou até a regra da matriz que o produziu.

### V-030 — Determinismo por replay
`P0` · `V0` · decisão · dep: X-002

Em modo replay, a mesma invocação devolve a mesma resposta a partir do cassete, sem chamada de rede, e as rolagens de `V-039` reproduzem os mesmos resultados.

**Aceite:** duas execuções em replay produzem sequência idêntica de mutações.

### V-031 — Custo do Validador
`P0` · `V4` · decisão · dep: C-007, V-002

As invocações debitam do orçamento do agente que agiu. Ao estourar, ações sem affordance falham por template diegético em vez de invocar o Validador.

As tentativas adicionais de `V-036` debitam do mesmo orçamento, e é isso que impede o laço de retentativa de virar despesa aberta.

**Aceite:** um agente sem orçamento continua agindo por affordance e recebe retorno diegético ao tentar o que exigiria mediação.

### V-032 — Falha e reparo
`P0` · `V4` · derivado · dep: L-007

Resposta que não valida contra o schema passa por um passe de reparo. Persistindo a falha, a ação resolve por caminho determinístico degradado e o incidente é registrado.

**Aceite:** uma resposta malformada nunca trava a simulação nem aplica mutação parcial.

### V-033 — Timeline narrativa
`P2` · `V7` · PDF 82-87 · dep: V-005

As narrativas em terceira pessoa alimentam a linha do tempo e a exportação de log narrativo.

**Aceite:** a exportação de uma partida produz texto legível na ordem cronológica dos eventos.

### V-034 — Painel de instruções
`P1` · `V4` · PDF 82-87 · dep: V-015

O usuário edita as instruções ativas durante a simulação, com efeito a partir da próxima invocação.

**Aceite:** alterar a instrução muda o comportamento do Validador sem reiniciar a simulação.

---

## Validação por domínio

### V-035 — Política de validação
`P0` · `V4` · decisão · dep: V-003, V-016

Conforme `ValidationPolicy`. O cenário declara em quais domínios o Validador **barra** e em quais ele apenas calcula consequência. Os domínios disponíveis são lei física, lei inviolável do cenário, proibição do usuário, integridade corporal, norma social e conservação de recurso.

A separação existe porque as duas posturas são incompatíveis e escolher uma para tudo custa caro dos dois lados. Um validador que barra em tudo devolve a aprovação binária que `V-003` substituiu, e faz o agente bater na mesma porta para sempre. Um validador que nunca barra deixa o mundo elástico demais para que qualquer restrição signifique alguma coisa — e um mundo sem restrição não produz drama, produz ruído.

Lista vazia significa validador puramente consequencial, e é uma configuração legítima.

**Aceite:** com `physicalLaw` na lista, tentar voar é negado e recuperável; com a lista vazia, a mesma tentativa é reinterpretada em pulo e nenhuma nova tentativa é solicitada.

### V-036 — Nova tentativa em domínio de porteiro
`P0` · `V4` · decisão · dep: V-035, V-031

Quando a negação ocorre dentro de um domínio de porteiro, o agente recebe a explicação diegética e decide de novo, com a tentativa anterior e o motivo no contexto. O número de tentativas adicionais é declarado na política e limitado a três no total.

Esgotadas as tentativas, o agente age pelo caminho degradado — a ação vira espera com retorno diegético — e a sequência inteira entra no registro de atividade como tentativa frustrada, alimentando `C-046`.

Fora dos domínios de porteiro **não há nova tentativa**: a negação é final e diegética. Essa assimetria é o que mantém o mecanismo pagável, porque negação fora de porteiro é justamente o caso comum.

**Aceite:** uma negação em domínio de porteiro produz nova decisão do agente com o motivo no contexto; uma negação fora dele não produz nenhuma chamada adicional.

### V-037 — Raciocínio explícito
`P0` · `V4` · decisão · dep: V-020

A resposta traz o caminho que levou ao veredito: que propriedades foram consideradas, que capacidade de quem foi pesada, que material importou, por que o desfecho é esse e não outro.

É auditável e **nunca** chega ao agente, que recebe apenas o retorno diegético de `V-006`. O raciocínio existe para que a pessoa que depura a simulação consiga distinguir um julgamento errado de um contexto mal montado — que são os dois modos de falha e têm consertos opostos.

**Aceite:** toda invocação registra raciocínio não vazio, e nenhum trecho dele aparece em texto entregue a um agente.

### V-038 — Consequências com probabilidade
`P0` · `V4` · decisão · dep: V-005

Além das mutações certas, a resposta pode enumerar desfechos possíveis com probabilidade estimada de 1 a 100. Desfechos do mesmo grupo exclusivo somam cem e apenas um ocorre; desfechos sem grupo são avaliados de forma independente.

A disciplina que faz isso valer a pena é a contenção: **a maior parte das ações não produz consequência incerta nenhuma**. Desfecho certo vai em mutação e não é sorteado. Probabilidade existe para o caso em que a incerteza é o conteúdo — se o galho aguenta, se o nó segura, se a mentira cola — e usá-la fora disso só acrescenta variância sem acrescentar drama.

**Aceite:** um grupo exclusivo cujas probabilidades não somam cem é rejeitado na validação, e uma bateria de ações triviais produz zero consequências probabilísticas.

### V-039 — Rolagem semeada
`P0` · `V4` · decisão · dep: V-038, X-004

A engine — nunca o modelo — resolve as probabilidades, com gerador semeado a partir da semente da partida combinada com hora simulada, agente e identificador da ação.

Isso preserva o determinismo por seed de `X-004` e mantém o cassete capaz de reproduzir a partida inteira: a resposta do modelo é gravada, e a rolagem é recalculável a partir da mesma semente. Um dado não semeado tornaria replay impossível e levaria junto toda a capacidade de depurar.

**Aceite:** duas execuções da mesma partida com a mesma semente produzem os mesmos resultados de rolagem, e a semente usada em cada rolagem aparece na trilha de auditoria.

### V-040 — Promoção por molde de fórmula
`P1` · `V5` · decisão · dep: V-021, V-022

Conforme `FormulaBinding`. Quando a causação nova é essencialmente numérica, o Validador pode promovê-la escolhendo um **molde de fórmula** do catálogo e preenchendo as constantes, em vez de propor uma regra de condição para efeito discreto.

O motivo é que problema numérico não cabe no formato discreto, e é exatamente onde a rechamada é eterna: massa vezes velocidade contra resistência é uma família infinita de casos que nenhuma tabela de condições enumera. O molde resolve a família inteira de uma vez.

O Validador **não escreve expressão**: ele escolhe entre moldes declarados em configuração e preenche parâmetros. Modelo escrevendo expressão arbitrária que passa a rodar na engine não seria auditável, não seria determinístico e não teria como ser impedido de estar errado.

**Aceite:** uma promoção numérica que cita molde inexistente ou parâmetro não declarado pelo molde é rejeitada e cai para caso único; uma promoção válida resolve o caso seguinte da mesma família sem nova chamada.

### V-041 — Funcionamento de item como destino de promoção
`P1` · `V5` · decisão · dep: V-021, O-021

Quando o julgamento é sobre o uso de um objeto, a promoção pode ter como destino o **Funcionamento** daquele tipo de objeto, em vez da matriz do substrato. A regra passa a responder por toda tentativa igual sobre todo exemplar daquele tipo.

É a mesma economia de `V-024` aplicada ao lugar onde ela rende mais: uso de objeto é a categoria de intenção mais repetida por agentes diferentes, e uma regra por tipo de objeto amortiza sobre a partida inteira.

A regra nasce no **primeiro** julgamento, e não depois de repetição observada. Isso segue `V-021`, onde a decisão de generalizar acontece na própria invocação, e não é detalhe: esperar a segunda ocorrência para promover significa pagar duas vezes por todo caso que generaliza, e casos que generalizam são a maioria. O preço de promover cedo é uma regra ocasionalmente inútil, que o teto de `V-027` contém e o painel de `V-025` descarta; o preço de promover tarde é uma chamada desperdiçada por regra, para sempre.

O Validador declara também se aquela tentativa habilita affordance nova no alvo, e nesse caso o objeto passa a oferecê-la pelo caminho de `V-002`, sem mediação.

A regra promovida é registrada como regra provisória de domínio `object`, com o `defId` do alvo, e materializada como `ItemRule` no Funcionamento daquele molde. Registro único e não dois: é o que faz o teto de regras vivas, a detecção de disparo anômalo e o painel de ciclo de vida valerem para as regras de objeto sem duplicar nenhum dos três.

**Aceite:** o primeiro julgamento sobre um uso improvisado de um tipo de objeto já traz veredito de generalização preenchido, e quando ele generaliza a tentativa igual seguinte — sobre qualquer exemplar do mesmo molde, por qualquer agente — resolve pela regra sem invocar o Validador; a regra aparece no painel de ciclo de vida junto das dos outros domínios e conta para o teto de `V-027`.

### V-042 — Atualização de descrição
`P1` · `V5` · decisão · dep: O-020, V-037

Após julgar, o Validador pode acrescentar informação à descrição sensorial ou à funcional do objeto envolvido, para poupar raciocínio nas próximas vezes.

A separação de `O-020` é preservada com rigor: o adendo sensorial é público e entra na percepção de quem quer que veja o objeto; o adendo funcional é oculto e só alimenta o contexto do próprio Validador. Escrever no lado errado vazaria para os agentes conhecimento que eles não têm como ter, que é precisamente o que a descrição dupla existe para impedir.

**Aceite:** um adendo funcional nunca aparece em percepção de agente, e um adendo sensorial aparece para todo agente que perceba o objeto.

### V-043 — Exposição funcional dos objetos
`P0` · `V4` · derivado de O-020 · dep: O-020, V-009

As descrições funcionais dos objetos em escopo entram no contexto do Validador, junto do instantâneo do substrato e pelo mesmo canal.

É essa exposição que permite ao Validador julgar corretamente um uso que o agente propôs com base numa crença errada: o agente decide pelo que acha que o objeto faz, e o mundo responde pelo que ele faz de fato. A divergência entre as duas coisas é o conteúdo.

**Aceite:** o prompt contém a descrição funcional de cada objeto relevante à ação, e nenhuma crença de agente aparece nesse bloco.

---

## Não-objetivos

**Memória em prosa do Validador.** A coerência entre dias vem do estado do mundo, que é autoritativo na engine, e do log causal determinístico de `X-005`. Um resumo narrativo seria segunda fonte de verdade inflando o prompt mais chamado do sistema.

**Validador como narrador onisciente.** Ele descreve consequência, não interioridade. O que os agentes pensam é da cognição.

**Validador com agenda.** Nada de mestre que empurra história. A tensão vem dos agentes.

**Dois níveis de Validador.** Um prompt. A alternativa a ele é a engine, não uma versão mais barata dele.

**Rolagem decidida pelo modelo.** O modelo estima probabilidade; quem sorteia é a engine, semeada. Um modelo que também sorteia destrói o replay e não é mais barato.

**Fórmula escrita livremente pelo modelo.** Moldes parametrizáveis cobrem a generalização numérica com auditoria e determinismo. Expressão arbitrária não tem nenhum dos dois.
