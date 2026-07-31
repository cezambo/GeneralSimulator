# SPEC-B — Corpo e saúde

Anatomia, lesão, doença, capacidades derivadas e cuidado. O substrato biológico.

Este documento absorve e substitui o que eram `A-012` a `A-019`. Aquela faixa fica aposentada em SPEC-A e não deve ser reutilizada.

---

## A tese: é o mesmo motor

O corpo não é um sistema novo. É o [substrato reativo](SPEC-R-substrato.md) rodando sobre outra topologia — uma árvore de vinte e poucos nós em vez de um grid de milhares.

| Mundo (SPEC-R) | Corpo (SPEC-B) |
|----------------|----------------|
| tile numa grade | parte numa árvore |
| material com etiquetas | **o mesmo material com as mesmas etiquetas** |
| estado transiente | condição |
| escalar com limiar — temperatura | escalar com limiar — dor, perda de sangue |
| campo calculado — luz, som | capacidade derivada — consciência, manipulação |
| matriz de reação | matriz de lesão: tipo de dano × propriedade do material |
| propagação por vizinhança | cascata pela árvore de partes |
| promoção de tile | progressão de condição |
| efeito nomeado invocável pelo GM | operação nomeada invocável pelo GM |
| trocar o material de um tile | trocar o material de uma parte |
| só tiles com estado ativo são avaliados | só agentes com condição ativa são avaliados |

A segunda linha é literal, e não uma analogia: **é o mesmo catálogo de materiais**, não um paralelo (B-003). Osso é uma entrada só, e serve tanto para um porrete quanto para um fêmur. Daí sai a penúltima linha — o GM pode transmutar o material de uma parte do corpo (B-038) porque a operação já existia para tiles e não precisou de nada novo.

Outras consequências práticas de reaproveitar o motor: as mesmas ferramentas de depuração servem, o mesmo log causal serve, a mesma disciplina de dado-em-vez-de-código serve, e as substâncias de R-029 já aterrissam aqui sem tradutor no meio.

**O critério de admissão é o mesmo:** o sistema produz fato que alguém pode perceber e sobre o qual vale a pena pensar. Mancar entra. Espirrar entra. Contagem de plaquetas não entra.

---

## Anatomia

### B-001 — Árvore de partes
`P0` · `V5` · decisão de RimWorld · dep: — · dados: `config/body.json`

O corpo é uma árvore de partes, cada uma com pai e filhos. Cerca de vinte e cinco nós, não mais:

```
corpo
├─ cabeça — crânio — cérebro · olhos · orelhas · nariz · mandíbula
├─ pescoço
├─ torso — caixa torácica — coração · pulmões
│         └─ estômago · fígado · rins
├─ braços — mãos — dedos
└─ pernas — pés
```

Vinte e cinco nós é escolha deliberada. Dwarf Fortress modela camadas de tecido por parte e paga caro por isso; o retorno narrativo do detalhe extra é próximo de zero.

Exemplo completo em [`config/body.example.json`](../../config/body.example.json).

**Aceite:** a árvore é carregada de dado, e trocar o arquivo por um corpo diferente não exige código.

### B-002 — Propriedades da parte
`P0` · `V5` · decisão de RimWorld · dep: B-001

Cada parte declara: vida máxima, **cobertura** (probabilidade relativa de ser atingida), profundidade (externa ou interna), se é **vital**, seu **material inicial**, e quais capacidades ela serve e com que peso.

Material inicial, não material fixo: o material corrente vive no estado do agente e pode divergir depois de uma transmutação (B-038).

**Aceite:** a soma das coberturas das partes externas é 1, e a distribuição de acertos ao longo de mil golpes aleatórios converge para ela.

### B-003 — Tecidos são o mesmo catálogo de materiais
`P0` · `V5` · decisão · dep: B-002, R-001, W-011

Não existe tabela de tecidos. Pele, músculo, osso, órgão, nervo e gordura são **entradas do mesmo catálogo** que descreve carvalho, ferro e vidro, no mesmo formato, com as mesmas propriedades, etiquetas, limiares térmicos e resistências por tipo de dano.

`osso` é a demonstração canônica: uma entrada só, que serve para o esqueleto de uma pessoa e para um porrete de osso. Ele já estava no catálogo do mundo em W-011 antes de existir um sistema de corpo.

Etiquetas que dão sentido biológico a um material:

| Etiqueta | O que habilita |
|----------|----------------|
| `tissue` | pode compor uma parte do corpo por padrão |
| `living` | cicatriza (B-023), apodrece, adoece |
| `vascular` | sangra quando ferido (B-017), aceita o vetor de injeção (R-030) |

Três consequências, e as três são a razão da decisão:

**A matriz de lesão consulta propriedade, nunca nome de tecido.** `corte + #living → laceração`, `impacto + #frágil → fratura`, `elétrico + #condutivo → choque`. Osso é frágil porque o catálogo diz que é, do mesmo jeito que vidro é.

**Todo o substrato de SPEC-R já se aplica ao corpo.** Carne queima porque é inflamável. Nervo conduz porque é condutivo. Corrosivo come pele. Frio fragiliza. Nada disso precisou ser escrito duas vezes — é o mesmo `config/reactions.json`.

**O GM pode transmutar o material de uma parte** (B-038) e o comportamento novo emerge sozinho, porque tudo que a lesão consulta veio do material.

Exemplo completo em [`config/materials.example.json`](../../config/materials.example.json).

**Aceite:** o catálogo de materiais é um arquivo só; um material novo com a etiqueta `tissue` pode compor uma parte do corpo sem nenhuma regra nova; e nenhuma regra da matriz de lesão nomeia um material por identificador.

### B-004 — Cascata estrutural
`P0` · `V5` · decisão · dep: B-001

Destruir uma parte destrói seus filhos. Destruir uma parte vital, ou zerar uma capacidade vital, mata.

Isto é o análogo da propagação por vizinhança, e é a **única** forma pela qual uma parte afeta outra diretamente — pela mesma razão que impacto não é química em R-003. Fora da contenção estrutural, vale a regra: **condição altera parte, condição altera condição, parte não altera parte.**

**Aceite:** destruir um braço destrói a mão e os dedos numa única operação, e o log causal registra a cascata.

### B-005 — Partes artificiais
`P2` · `V7` · derivado · dep: B-002

Uma parte pode ser substituída por versão artificial, com eficiência própria, possivelmente acima de 100%. Substituições são condições permanentes (B-006), não um sistema separado.

**Aceite:** uma perna de pau restaura movimento parcial, e uma prótese melhor restaura mais.

---

## Condições

### B-006 — Uma unidade só
`P0` · `V5` · decisão de RimWorld · dep: B-001

Ferimento, doença, infecção, cicatriz, prótese, efeito de substância, condição crônica, estado mental, exaustão, desnutrição, gravidez — **tudo é uma condição**, com a mesma estrutura.

Este é o achado central do RimWorld, e a razão de o sistema dele ser modular sem ser caro: existe um tipo, um laço de atualização, uma tela, um caminho de serialização. Adicionar tuberculose e adicionar ressaca custam a mesma coisa: uma entrada em arquivo de dado.

**Aceite:** definir uma condição inédita não exige nenhuma linha de código.

### B-007 — Anatomia de uma condição
`P0` · `V5` · decisão · dep: B-006 · dados: `config/conditions.json`

Uma condição declara: identificador, parte alvo ou corpo inteiro, severidade de 0 a 1, estágios, dor que contribui, sangramento que contribui, offsets de capacidade, progressão por dia, cadência de atualização, e o que deixa para trás quando termina.

Exemplo completo em [`config/conditions.example.json`](../../config/conditions.example.json).

**Aceite:** o validador recusa condição sem cadência declarada.

### B-008 — Estágios por severidade
`P0` · `V5` · decisão de RimWorld · dep: B-007

Cada condição tem estágios que ativam em severidades mínimas, e cada estágio traz seus próprios modificadores. É o que produz comportamento não-linear — uma gripe que era um incômodo vira ameaça de vida ao cruzar um limiar — a custo de uma comparação.

**Aceite:** uma condição de quatro estágios muda de efeito exatamente nos limiares declarados, sem interpolação.

### B-009 — Progressão
`P0` · `V5` · decisão · dep: B-007

A severidade se move por dia a uma taxa declarada, que pode ser negativa. Progressão negativa é cura; positiva é agravamento. A taxa pode depender de capacidade, descanso e tratamento.

**Aceite:** um corte deixado em paz regride sozinho ao longo de dias.

### B-010 — Cadência declarada
`P0` · `V5` · decisão · dep: B-007

Toda condição declara com que frequência precisa ser avaliada: **estática** (nunca — cicatriz, prótese, membro faltando), **lenta** (uma vez por hora simulada — doença, cicatrização), **rápida** (a cada tick — sangramento, queimadura ativa).

A maioria esmagadora das condições de um mundo em regime é estática. Elas existem, modificam capacidades, aparecem na descrição, e custam zero por tick.

**Aceite:** um agente com cinco cicatrizes e uma perna faltando não consome nenhum tempo de CPU no laço de saúde.

---

## Capacidades

### B-011 — O conjunto de capacidades
`P0` · `V5` · decisão de RimWorld · dep: B-002

Consciência, visão, audição, movimento, manipulação, fala, respiração, bombeamento sanguíneo, filtragem sanguínea, digestão, metabolismo.

Vitais, cuja perda total mata: consciência, respiração, bombeamento, filtragem, digestão.

**Aceite:** cada capacidade é inspecionável no painel com seu valor corrente e a lista do que a está reduzindo.

### B-012 — Cálculo da capacidade
`P0` · `V5` · decisão de RimWorld · dep: B-011

Uma capacidade é a soma ponderada da eficiência das partes que a servem, mais os offsets das condições ativas, limitada pelos tetos que alguma condição imponha.

Nada é atribuído diretamente. A especificação anterior já calculava consciência assim; a diferença é que agora **tudo** funciona assim, e a fórmula única de consciência dá lugar a uma composição de partes e condições.

**Aceite:** perder uma perna reduz movimento em aproximadamente metade, e perder as duas zera.

### B-013 — Consciência como multiplicador global
`P0` · `V5` · decisão de RimWorld · dep: B-012

Consciência depende do cérebro, do bombeamento sanguíneo, da respiração, da filtragem e da dor. E multiplica movimento, manipulação e fala.

É o gargalo que amarra o corpo inteiro: um pulmão perfurado não parece ter relação com a firmeza da mão, mas tem, porque passa pela consciência. Interdependência sem regra escrita para o par.

Abaixo do limiar de desmaio, o agente cai. Em zero, morre.

**Aceite:** dano pulmonar isolado reduz mensuravelmente a manipulação, sem que exista regra ligando pulmão a mão.

### B-014 — Consciência escolhe o tier
`P0` · `V5` · decisão · dep: B-013, L-004

O nível de consciência seleciona o tier de LLM usado no próximo pensamento. Consciência baixa força `instinct`: pensamento curto, barato, impulsivo.

Duas coisas de uma vez, e é por isso que este requisito importa mais do que parece: um agente ferido **pensa pior**, o que é dramaticamente correto, e **custa menos**, o que é economicamente conveniente. O incentivo do sistema aponta na direção certa.

**Aceite:** um agente com dor alta produz decisões visivelmente mais curtas e impulsivas, e o custo por pensamento cai.

### B-015 — Recomputação por invalidação
`P0` · `V5` · decisão · dep: B-012

Capacidades são função pura do conjunto de partes vivas e condições ativas. São recalculadas **quando esse conjunto muda**, nunca a cada tick.

**Aceite:** um agente estável por mil ticks executa zero recálculos de capacidade.

---

## Escalares

### B-016 — Dor
`P0` · `V5` · decisão de RimWorld · dep: B-007

Dor é a soma das dores das condições ativas, modulada pelo limiar de dor da personalidade. Abaixo de um piso não tem efeito; acima, reduz consciência progressivamente até um teto.

O piso existe para que arranhões não deixem ninguém tonto.

**Aceite:** dor abaixo do piso não altera consciência; acima, altera de forma monotônica e limitada.

### B-017 — Sangramento e perda de sangue
`P0` · `V5` · decisão de RimWorld · dep: B-007, R-025

Condições declaram taxa de sangramento. A soma alimenta uma condição de corpo inteiro, *perda de sangue*, que sobe enquanto houver sangramento e desce quando parar. Cheia, mata. No caminho, derruba consciência por estágios.

E — o detalhe que liga o corpo ao mundo — **quem sangra deixa cobertura de sangue nos tiles por onde passa** (R-025). O rastro é perceptível, persiste, e acusa.

**Aceite:** um agente ferido atravessando um cômodo deixa vestígio que outro agente encontra depois e consegue seguir.

### B-018 — Temperatura corporal
`P1` · `V5` · derivado · dep: R-007, B-006

O corpo participa do sistema térmico do mundo como qualquer entidade. Cruzar limiares gera condições de hipotermia ou insolação, com estágios.

Roupa isola; roupa molhada esfria (R-022). Nada disso precisa de regra própria — é o substrato de R-007 rodando sobre um corpo.

**Aceite:** um agente encharcado ao relento numa noite fria desenvolve hipotermia progressiva sem regra específica de clima.

### B-019 — Necessidades como escalares com limiar
`P0` · `V5` · PDF 45, 59 refinado por decisão · dep: B-006

Fome, sede, energia, higiene, bexiga, conforto e necessidade social decaem em taxas configuráveis. Cruzar o limiar crítico **gera uma condição** — desnutrição, desidratação, privação de sono — com estágios, dor e offsets como qualquer outra.

Assim necessidade e saúde deixam de ser dois sistemas. Fome extrema não "drena vitalidade" por regra especial; ela produz desnutrição, que faz o que qualquer condição faz.

**Aceite:** fome sustentada acima do limiar produz desnutrição com estágios, e comer a regride pelo caminho inverso.

---

## Lesão

### B-020 — Matriz de lesão
`P0` · `V5` · decisão · dep: B-003, R-012 · dados: `config/conditions.json`

Tipo de dano cruzado com **propriedade do material** produz condição. Mesma forma de regra de reescrita da matriz de reação, mesmo formato de arquivo, mesmo validador — inclusive o campo `porque` obrigatório e a proibição de R-001 de nomear material por identificador.

| Dano | Material | Condição |
|------|----------|----------|
| corte | `#living` | laceração, sangra pelo fator do material |
| corte | `#frágil & #living` | fratura exposta |
| contusão | `#frágil` | fratura |
| contusão | `#living` | hematoma |
| perfuração | `#vital` | perfuração, sangra muito, risco alto de infecção |
| queimadura | `#inflamável` | queimadura por estágio |
| frio | `#living` | ulceração por congelamento |
| elétrico | `#condutivo` | choque, inconsciência possível |
| corrosivo | `#living` | queimadura química |
| qualquer | `!#living` | nenhuma condição: perde integridade como objeto (R-027) |

A coluna do meio é etiqueta e não nome de tecido, e a última linha é a que fecha o desenho. Ossos são frágeis porque o catálogo diz que são — igual a vidro e cerâmica. Nervos conduzem porque são condutivos — igual a cobre. E uma parte cujo material deixou de ser vivo simplesmente para de adoecer e passa a se comportar como matéria, que é exatamente o que se espera depois de uma transmutação (B-039).

**Aceite:** cada linha tem teste; adicionar um tipo de dano novo é editar dado; e nenhuma linha nomeia um material por identificador.

### B-021 — Seleção da parte atingida
`P0` · `V5` · decisão de RimWorld · dep: B-002

A parte atingida é sorteada pela cobertura, com viés quando a ação declara alvo. Partes internas só são atingidas se a camada externa já estiver comprometida ou se o dano for penetrante.

**Aceite:** golpes aleatórios acertam o torso com muito mais frequência que os dedos, na proporção declarada.

### B-022 — O mundo fere
`P0` · `V5` · decisão · dep: B-020, R-033

Estado de tile e evento físico entram na matriz de lesão como qualquer outro dano: fogo queima, eletrificado choca, queda contunde, escombro esmaga, gás tóxico entra pela via de inalação (R-030).

Não há caminho separado para "dano ambiental". É o mesmo.

**Aceite:** atravessar um tile em chamas produz queimadura na perna, não um decremento genérico de vitalidade.

---

## Doença, cura e cuidado

### B-023 — Cicatrização e cicatriz
`P1` · `V5` · derivado de RimWorld · dep: B-009

Ferimentos regridem sozinhos ao longo de dias, mais rápido com descanso e nutrição. Ao terminar, alguns deixam **cicatriz** — condição permanente, estática, com dor residual e possível perda de eficiência.

O corpo acumula história. Uma cicatriz é uma memória que outros conseguem ver.

**Aceite:** um ferimento grave curado deixa cicatriz permanente que aparece na descrição percebida por terceiros.

### B-024 — Infecção como corrida
`P0` · `V6` · decisão de RimWorld · dep: B-009

Ferida infeccionada inicia uma corrida entre **severidade** e **imunidade**, ambas partindo de zero. A primeira a chegar ao fim vence: severidade cheia mata, imunidade cheia cura.

A assimetria é o desenho inteiro, e é o que gera drama sem script:

| | Efeito |
|---|---|
| sem tratamento | severidade sobe mais rápido que a imunidade — o paciente perde |
| tratamento | **não** acelera imunidade; desacelera a severidade |
| descanso, nutrição, filtragem sanguínea saudável | aceleram a imunidade |

Ou seja: remédio sozinho não salva, e descanso sozinho não salva. É preciso alguém tratando **e** o doente aceitando ficar deitado — o que é exatamente onde teimosia, obrigação e vínculo entram em conflito.

Números iniciais em `config/tuning.json`, calibrados para que a janela seja apertada mas vencível.

**Aceite:** uma infecção não tratada mata dentro do prazo previsto; tratada e com repouso, cura; tratada sem repouso, é decidida no fio.

### B-025 — Qualidade de tratamento
`P1` · `V6` · decisão de RimWorld · dep: B-024, A-022

A qualidade de um tratamento vem da habilidade de medicina de quem trata, da qualidade do insumo usado e da limpeza do local.

Sangramento para com qualquer tratamento, mesmo péssimo. Infecção exige qualidade. Essa diferença é o que faz primeiros socorros improvisados valerem a pena sem tornar o curandeiro dispensável.

**Aceite:** um tratamento de qualidade zero estanca o sangramento e quase não altera a corrida da infecção.

### B-026 — Dependência de cuidado
`P1` · `V6` · derivado · dep: B-013, S-001

Quem está abaixo do limiar de consciência ou sem movimento não se trata, não come e não bebe sozinho. Precisa que outro agente vá até lá.

É um gerador de vínculo e de conflito que não custa nada: quem cuida, quem não cuida, quem foi deixado, quem foi salvo. Tudo isso vira opinião.

**Aceite:** um agente incapacitado morre em prazo previsível se ninguém o assistir, e a omissão é registrada como fato perceptível pelos que estavam por perto.

### B-027 — Contágio
`P2` · `V6` · dep: R-032

Doenças contagiosas usam o mecanismo de R-032. Nada específico aqui.

**Aceite:** conforme R-032.

### B-028 — Idade e cronicidade
`P2` · `V7` · derivado de RimWorld · dep: B-006

Com o tempo, agentes desenvolvem condições crônicas — dores nas costas, catarata, fragilidade, perda de audição — com probabilidade crescente por idade. Todas estáticas, todas condições comuns.

**Aceite:** um agente idoso acumula condições crônicas ao longo de anos simulados, sem nenhum sistema de envelhecimento dedicado.

### B-029 — Morte com causa
`P1` · `V5` · derivado · dep: B-004, R-048

A morte registra a causa: qual capacidade zerou, qual parte foi destruída, qual condição venceu, e a cadeia que levou até lá. O corpo permanece no mundo, apodrece (R-038) e emite odor (R-036).

A morte é evento global, gera memória marcante em quem testemunhou, e dispara reavaliação de meta primária em quem tinha vínculo.

**Aceite:** dado um agente morto, é possível reconstruir a cadeia completa desde o primeiro ferimento.

---

## Ponte com a cognição

Esta seção é a razão de o resto existir. Um corpo detalhado que a mente não enxerga é custo sem retorno — a mesma regra de R-037.

### B-030 — O corpo entra no prompt como prosa
`P0` · `V5` · decisão · dep: B-011, L-006

O contexto de pensamento **nunca** recebe a tabela de partes e capacidades. Recebe uma descrição curta em linguagem natural do que é saliente: o que dói, o que não funciona, o que se sente.

> "Seu braço esquerdo está quebrado e dói muito. Você está fraco de fome e tem dificuldade de se concentrar."

Não:

> `braço_esq: 0.0 · manipulação: 0.51 · dor: 0.62 · consciência: 0.78`

Este é o requisito de custo mais importante do documento. A simulação pode ser rica porque o resumo é barato: o corpo custa dezenas de tokens por prompt, não centenas, e o que determina a conta do projeto é token, não CPU.

**Aceite:** a descrição corporal cabe num orçamento de tokens declarado em `tuning.json`, e condições irrelevantes para a decisão corrente são omitidas.

### B-031 — Capacidade perdida invalida objetivo
`P0` · `V5` · decisão · dep: B-012, C-014

Objetivos declaram as capacidades que exigem. Quando uma cai abaixo do necessário, o objetivo é marcado inviável e dispara reavaliação.

Um ferreiro que perde a mão não fica tentando forjar em silêncio. Ele tem uma crise, e é uma crise que ninguém escreveu.

**Aceite:** perder manipulação abaixo do limiar de um objetivo ativo dispara reavaliação de meta no mesmo ciclo.

### B-032 — O corpo é perceptível
`P0` · `V5` · decisão · dep: R-037, A-007

Mancar, braço na tipoia, palidez, tosse, tremor, cicatriz, magreza, sangue na roupa — tudo derivado de condições e coberturas, tudo descrito para quem observa, sujeito a distância e luz.

Um agente que vê outro tossindo há dias forma opinião sobre isso. Doença vira assunto, assunto vira medo, medo vira lei comunitária. Nada disso precisa ser escrito.

**Aceite:** a descrição que um agente recebe de outro inclui os sinais corporais visíveis, e apenas os visíveis à distância e luz correntes.

### B-033 — Corpo modula temperamento
`P1` · `V5` · derivado · dep: B-016, C-002

Dor, doença, fome e exaustão entram no contexto como estado, e reduzem paciência em interação social. Não determinam comportamento — a personalidade continua no comando — mas inclinam.

**Aceite:** numa amostra de conversas, agentes com dor alta produzem mais respostas ríspidas que os mesmos agentes saudáveis.

---

## Fronteira com o GM

O corpo é substrato, e substrato é território do GM pelas mesmas regras de R-041 a R-046. Esta seção não abre exceção nenhuma: apenas diz o que, no corpo, corresponde a cada peça daquele contrato.

A tese é curta. **O GM mexe em causas; a engine deriva o resto.** Ele pode trocar o material de um osso, mas não pode escrever quanta consciência alguém tem.

### B-034 — O corpo é exposto ao GM
`P0` · `V5` · decisão · dep: R-041, G-005

O contexto do GM inclui, para cada agente em escopo:

- a **árvore de partes**, com o material corrente de cada uma e suas propriedades relevantes;
- as **condições ativas**, com severidade e estágio;
- as **capacidades**, cada uma com as partes e condições de que ela deriva;
- o **vocabulário de operações invocáveis** sobre aquele corpo (B-037).

A última linha é a que faz as outras valerem alguma coisa: sem o display das alavancas, o GM não sabe que elas existem, e o mesmo raciocínio de R-041 se aplica. Mostrar que o fêmur é de osso e que osso é frágil é o que permite ao GM entender por que uma queda o quebrou.

**Aceite:** ao mediar um golpe, o prompt do GM mostra o material da parte atingida, as condições que aquele material aceita e as capacidades que a parte serve.

### B-035 — Resumo da matriz de lesão em linguagem natural
`P1` · `V5` · derivado de R-042 · dep: B-020, B-034

O GM recebe um resumo do que a matriz de lesão já resolve sozinha, gerado a partir do campo `porque` das regras aplicáveis ao escopo — exatamente como R-042 faz para as reações do mundo.

É o que permite ao GM saber quando **não** agir.

**Aceite:** o resumo é gerado a partir de `config/conditions.json` e acompanha qualquer alteração dele sem edição manual do prompt.

### B-036 — O GM muta causas, nunca valores derivados
`P0` · `V5` · decisão · dep: B-012, R-045

Esta é a regra que mantém o corpo coerente sob intervenção narrativa.

| O GM pode escrever | O GM nunca escreve |
|---|---|
| condição — adicionar, agravar, aliviar, remover | capacidade (consciência, manipulação, visão…) |
| material de uma parte | dor total, sangue total, temperatura corporal |
| vida, ausência ou presença de uma parte | `isAlive` |
| substância aplicada por uma via | qualquer campo marcado como derivado no schema |

A coluna da direita é composta inteiramente de valores recalculados a partir da coluna da esquerda (B-012, B-015). Escrever neles produz um valor que o próximo recálculo apaga — um no-op silencioso, que é a pior classe de defeito possível, e que ainda por cima faria o GM mentir para si mesmo no tick seguinte.

Então a tradução é obrigatória e é sempre possível: se o GM quer alguém inconsciente, ele aplica uma condição que derruba consciência. Se quer alguém morto, destrói uma parte vital ou aplica uma condição fatal.

Consequência boa e não planejada: **morte por intervenção do GM nasce com cadeia causal completa**, porque passou pelo mesmo caminho de qualquer outra morte. B-029 continua verdadeiro mesmo quando quem matou foi a narrativa.

É o mesmo princípio de R-045 — o GM não simula física, decide se um efeito começa — aplicado ao corpo: o GM não calcula fisiologia, decide o que muda.

**Aceite:** uma mutação do GM que aponte para um campo derivado é rejeitada pelo validador com erro nomeado, e a mensagem sugere qual condição produz aquele efeito.

### B-037 — Vocabulário de operações biológicas
`P0` · `V5` · decisão · dep: B-034, R-015

O corpo expõe um vocabulário fechado e nomeado, análogo ao vocabulário de efeitos de R-015. Toda intervenção do GM no corpo é uma dessas, emitida como mutação `engine_effect`:

| Operação | Efeito |
|---|---|
| `apply_condition` | inicia uma condição numa parte ou no corpo. É o análogo direto de `ignite` no mundo |
| `worsen_condition` / `relieve_condition` | move a severidade de uma condição já ativa |
| `remove_condition` | encerra uma condição, com ou sem sequela |
| `transmute_part` | troca o material de uma parte (B-038) |
| `damage_part` / `heal_part` | move a vida de uma parte |
| `sever_part` / `attach_part` | remove ou acopla uma parte, incluindo próteses |
| `apply_substance` | introduz uma substância por uma via de R-030 |

Fechado, e não aberto, pela mesma razão de R-015: o que não está na lista não é invocável, e a saída do GM é validável contra schema antes de tocar o estado.

**Aceite:** o schema de saída do GM aceita exatamente estas operações e rejeita qualquer outra pelo nome.

### B-038 — Transmutação de material de parte
`P1` · `V6` · decisão · dep: B-003, B-036

O GM pode trocar o material corrente de uma parte do corpo por **qualquer entrada do catálogo de materiais** — inclusive entradas sem nenhuma característica biológica.

Transformar os ossos de alguém em ferro, vidro ou pedra é uma operação de uma linha, e ela é possível não porque foi prevista, mas porque tecidos e materiais do mundo são o mesmo catálogo desde B-003. Não há código para "ossos de ferro" em lugar nenhum.

A transmutação é registrada como condição permanente (B-006), o que lhe dá de graça: histórico, descrição perceptível, serialização e reversibilidade.

**Aceite:** transmutar o fêmur de um agente para `ferro` altera imediatamente as resistências, limiares e etiquetas consultadas pela matriz de lesão, sem nenhuma regra específica para o caso.

### B-039 — As consequências da transmutação são emergentes
`P1` · `V6` · derivado · dep: B-038

Nada é calculado especialmente para uma parte transmutada. Tudo que a lesão, a temperatura, o peso e a percepção consultam já vinha do material — então trocar o material muda o comportamento inteiro, de uma vez, sem regra nova. É a promessa de R-001 cobrada no corpo.

| Transmutação | O que passa a valer, sozinho |
|---|---|
| osso → **vidro** | perde `living`: para de cicatrizar e de infeccionar. Continua frágil, mas a resistência a impacto cai de 0,1 para 0,0 — quebra com quase nada. Ganha `transparent`, e portanto vira sinal visível (B-032) e assunto na comunidade. |
| osso → **ferro** | deixa de ser frágil e praticamente não fratura. Ganha `conductive`: um choque que antes morria no nervo agora percorre o esqueleto. Densidade salta de 1,9 para 7,8 — o agente pesa muito mais e carrega muito menos. Não cicatriza. |
| pele → **pedra** | deixa de ser inflamável: fogo para de queimar e passa só a aquecer. Corte deixa de lacerar. Calor específico cai de 3500 para 840 — a região esquenta e esfria rápido, e a regulação térmica ali se perde. |
| músculo → **gelo** | ponto de fusão 0. Em ambiente acima de zero a parte simplesmente derrete e se destrói em poucos ticks, por R-009. **O GM não precisava saber disso**, e provavelmente não sabia. |

A última linha é o teste do desenho. Uma intervenção narrativa gerou uma consequência física que ninguém escreveu, ninguém previu e é perfeitamente explicável pelo log causal.

E o ciclo fecha na cognição: a parte transmutada entra na prosa do prompt do próprio agente (B-030) — "seu braço direito é de pedra, é pesado e você não sente nada nele" — é visível para os outros (B-032), e vira opinião. É o princípio geral do projeto operando: **o físico existe para o social**.

**Aceite:** transmutar músculo para `gelo` num ambiente a 20 °C destrói a parte por fusão dentro do prazo previsto por R-009, sem nenhuma regra escrita para o caso, e a cadeia aparece completa no log causal.

### B-040 — Invocação de condição pelo GM
`P0` · `V5` · decisão · dep: B-034, R-043

O GM pode iniciar qualquer condição do catálogo. A partir da invocação **a engine assume**: o GM aplica a fratura, e quem faz a dor subir, a capacidade cair, a infecção correr e o osso consolidar é B-009 a B-024.

O papel é o mesmo de R-043: o GM é fonte de **causação nova**. A matriz de lesão sabe o que acontece dado que um dano ocorreu; ela não sabe enumerar todas as maneiras que uma pessoa pode inventar de se machucar.

**Invocação legítima:** um agente diz que desceu correndo uma escada improvisada de tábuas. Nenhuma regra liga isso a nada. O GM julga plausível e invoca `apply_condition` de entorse no tornozelo. Daí em diante o corpo cuida sozinho.

**Contraexemplo, onde o GM não invoca nada:** um agente esfaqueia outro. Existe dano cortante, existe parte atingida, existe material vivo. A matriz resolve (B-020). O GM apenas autoriza o golpe.

**Aceite:** esfaquear alguém produz zero invocações de condição pelo GM.

### B-041 — Dano, remoção e restauração de parte
`P1` · `V6` · derivado · dep: B-037, B-004

O GM pode ferir, destruir, decepar, recolocar ou substituir uma parte diretamente, quando o método descrito não tem caminho modelado.

Destruir uma parte dispara a cascata estrutural de B-004 normalmente, inclusive a morte se a parte for vital. O GM não decide que alguém morreu; ele destrói o coração, e a morte é consequência com causa registrada.

**Aceite:** uma invocação que destrói o coração produz morte por cadeia causal ordinária, indistinguível no log de uma morte causada por golpe.

### B-042 — Aplicação de substância pelo GM
`P2` · `V6` · dep: R-030, R-031

O GM pode introduzir uma substância por qualquer via de R-030 — ingestão, inalação, contato, injeção. A partir daí valem integralmente as regras de substância, incluindo incubação, efeitos cognitivos e contágio. Nada específico aqui.

**Aceite:** conforme R-030 e R-031.

### B-043 — Não-duplicação
`P0` · `V5` · decisão · dep: B-035, R-044

Antes de invocar, o GM verifica se a matriz de lesão já cobre o resultado. Havendo caminho modelado — faca, queda, fogo, frio, corrosivo, veneno ingerido —, ele **autoriza e não invoca**. Invocar por cima aplica o dano duas vezes.

**Aceite:** numa amostra de execuções com combate e acidentes comuns, a taxa de invocação biológica do GM fica abaixo do limiar declarado em `tuning.json`.

### B-044 — Operações extraordinárias e registro de plausibilidade
`P1` · `V6` · decisão · dep: B-038, G-004

Transmutar ossos é mecanicamente trivial e narrativamente enorme. As duas coisas precisam ficar separadas.

O cenário declara um **registro de plausibilidade**: o conjunto de operações que o GM está autorizado a invocar naquele mundo. Um vilarejo comum autoriza condição, dano e substância, e não autoriza transmutação nem recolocação de membro. Um cenário sobrenatural autoriza tudo.

A engine **sempre** suporta a operação inteira. O registro governa apenas o que o GM pode escolher fazer, e o padrão é conservador. A separação existe porque a alternativa — deixar o modelo julgar o gênero do mundo a cada chamada — produz deriva tonal, que é o modo de falha mais comum e mais irrecuperável de um GM de LLM.

Duas camadas, e elas fazem coisas diferentes. Operação **fora** do registro é rejeitada pelo validador, sem chegar ao estado. Operação **dentro** do registro mas irreversível — decepar, destruir parte vital, transmutar — exige o tier alto (L-004) e justificativa explícita registrada.

**Aceite:** com o registro padrão, uma invocação de `transmute_part` é rejeitada antes de tocar o estado e a rejeição aparece no painel com o motivo; com o registro sobrenatural, a mesma invocação passa, mas só a partir do tier alto e com justificativa preenchida.

### B-045 — Promoção generalizada (corpo)
`P1` · `V5` · derivado de R-046 · dep: B-040, X-006

Extensão do mecanismo único de R-046 ao domínio `body`. Toda invocação biológica registra método + operação; `generalization` na saída do GM segue o mesmo contrato. Repetição além do limiar → candidato a linha em `config/conditions.json`.

**Aceite:** painel lista métodos improvisados com regra sugerida colável; regra provisória entra viva e é revisável.

---

## Custo

O projeto escala em número de agentes, e este documento é o que mais arrisca comprometer isso. As regras abaixo não são otimização prematura — são condição de existência do sistema.

### B-046 — Agente saudável custa zero
`P0` · `V5` · decisão · dep: B-010, B-015

Só entram no laço de saúde os agentes com ao menos uma condição de cadência não-estática. Um agente íntegro não é visitado.

Exatamente a mesma disciplina de R-014, onde só tiles com estado ativo são avaliados.

**Aceite:** com vinte agentes saudáveis, o laço de saúde executa zero iterações por tick.

### B-047 — Cadência escalonada
`P0` · `V5` · decisão · dep: B-010

Condições rápidas rodam a cada tick; lentas, uma vez por hora simulada, distribuídas entre os ticks para não concentrar pico; estáticas, nunca.

**Aceite:** o custo do laço de saúde não apresenta picos periódicos sincronizados entre agentes.

### B-048 — Representação compacta
`P1` · `V5` · derivado · dep: B-001

Partes em vetor de tamanho fixo indexado por posição, não em grafo de ponteiros. Condições em vetor pequeno por agente. Sem alocação por tick no caminho quente.

**Aceite:** o estado de saúde de um agente cabe num bloco contíguo e serializa sem travessia de grafo.

### B-049 — Orçamento declarado
`P1` · `V5` · derivado de X-008 · dep: B-046

O sistema de saúde inteiro cabe num orçamento de tempo por tick, medido e reportado ao lado do orçamento do substrato (R-049).

A referência honesta: uma chamada de LLM custa entre centenas de milissegundos e alguns segundos. O corpo de vinte agentes deve custar frações de milissegundo. Se algum dia a saúde aparecer no perfil de performance, alguma coisa foi desenhada errada.

**Aceite:** com vinte agentes e dez condições ativas cada, o laço permanece dentro do orçamento declarado.

### B-050 — Determinismo
`P0` · `V5` · derivado de X-004 · dep: R-047

Toda aleatoriedade — parte atingida, chance de infecção, variação de imunidade — vem do gerador semeado.

**Aceite:** mesma seed e mesmas ações produzem exatamente o mesmo histórico médico.

### B-051 — Tudo em dado
`P0` · `V5` · decisão · dep: R-050

Árvore de partes, tecidos, condições, matriz de lesão, limiares e taxas vivem em `config/`, validados por schema.

**Aceite:** é possível criar uma doença nova, com estágios e sintomas, sem tocar em arquivo `.ts`.

---

## Não-objetivos

Fora de escopo por decisão: camadas de tecido por parte, cirurgia com procedimentos individuais, farmacocinética, sistema imunológico com tipos de patógeno, genética, e ciclo reprodutivo detalhado.

O corpo aqui existe para produzir três coisas: **limitação** que muda o que o agente consegue fazer, **sofrimento** que muda como ele pensa, e **sinal visível** que muda o que os outros pensam dele. O que não serve a uma dessas três não entra.
