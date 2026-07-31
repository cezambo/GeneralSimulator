# SPEC-O — Objetos

Peso, volume, empacotamento, composição, trânsito, carga, descrição, crença e funcionamento.

O objeto como molde e como exemplar já está declarado em [SPEC-W](SPEC-W-mundo.md), na faixa `W-029` a `W-034`, e é lá também que ficam a célula que o guarda e a ocupação que ele toma. Este documento diz o que um objeto **é** fisicamente, o que se sabe sobre ele, e o que acontece quando ele é guardado, carregado, arremessado, montado ou quebrado. O substrato que age sobre objetos — temperatura, integridade, estados transientes, coberturas — está em [SPEC-R](SPEC-R-substrato.md). Quem carrega está em [SPEC-A](SPEC-A-agente.md) e paga o peso em [SPEC-B](SPEC-B-corpo.md). Quem julga o uso que nenhuma regra previu é o Validador de [SPEC-V](SPEC-V-validador.md).

---

## A tese: objeto é a superfície mais barata de narrativa

Ninguém tem o que contar sobre um número. Tem o que contar sobre uma coisa: quem trouxe, quanto pesava, o que não ia caber, o que quebrou na hora errada, para que aquilo servia de verdade — e quem estava errado sobre isso.

O documento persegue uma meta única: **ampliar o que pode acontecer sem ampliar o que precisa ser calculado**. Cada requisito aqui existe porque um punhado de números por definição de objeto produz uma família de situações que ninguém escreveu. E onde a versão rica seria também a versão caça-tick — integrar trajetórias, simular corpo rígido, guardar o que cada agente pensa de cada item —, o requisito diz explicitamente por que a versão barata produz o mesmo fato observável.

Três decisões governam o resto.

**Grandeza real em vez de contagem.** Peso e volume, não slots. Um slot afirma que uma bigorna e uma colher são a mesma coisa; é uma mentira barata que devolve nada, porque impede que carregar, guardar ou dar chegue a ser dilema.

**Um corpo para a física, muitas peças para o sentido.** Um objeto composto se move como um só e é desenhado como um só, mas o calor caminha pelas suas juntas, o peso vem de baixo, e a quebra de uma peça solta o que dependia dela.

**Só o divergente é guardado.** O que um indivíduo acredita sobre um item existe como estado apenas quando ele está errado. É o que impede o estado de crescer com agentes × itens, e dá de brinde a propriedade de que o registro existir já significa mal-entendido.

---

## Grandeza física

### O-001 — Peso e volume reais
`P0` · `V2` · decisão · dep: W-029, W-030

Toda definição declara **peso** em quilogramas e **volume** em metros cúbicos, conforme `ObjectDef`, e o exemplar no mundo é `WorldObject`. Dessas duas grandezas sai todo o resto do documento: quanto cabe num recipiente, quanto um indivíduo consegue levar, quanto isso o atrasa, quanto pesa uma coisa montada de outras coisas.

Volume aqui é a matéria efetiva, sem o desperdício da forma. O desperdício é assunto de O-002, e a separação importa: derreter cinco quilos de ferro em barra ou em galhada dá o mesmo volume de matéria e ocupações de mochila completamente diferentes.

Contagem de itens deixa de ser unidade de capacidade em qualquer lugar do simulador. O que se ganha ao trocar slot por grandeza não é realismo — é dilema: o que deixar para trás, o que carregar em vez do quê, quem consegue levar o corpo do outro até a enfermaria e quem só consegue arrastar. Nenhuma dessas frases é escrevível num sistema de slots.

**Aceite:** nenhum caminho da engine usa contagem de itens como limite de capacidade, e o peso e o volume de qualquer exemplar são inspecionáveis no painel.

### O-002 — Empacotamento como multiplicador
`P0` · `V2` · decisão · dep: O-001

Cada definição declara um **multiplicador de empacotamento** de 1 a 10 — o PEM — que multiplica o volume para dar o volume realmente ocupado quando o objeto está guardado. É a medida de quão trambolhuda a coisa é.

Um cubo perfeito vale 1: ele encosta em tudo à volta e não sobra vão. Uma galhada, um arco, uma cadeira valem muito mais, porque o espaço que tomam não é o da sua matéria e sim o do envelope desengonçado que impõem ao redor. O PEM é o que permite um saco levar oito pães e não levar dois arcos, sem que exista sistema de forma, malha de colisão ou quebra-cabeça de encaixe em lugar nenhum — um número por definição, uma multiplicação por consulta.

Um recipiente pode declarar-se feito sob medida para certas definições (`fittedFor`). Guardar uma dessas ali derruba o PEM ao piso declarado em `tuning.json`, e é o que faz uma aljava valer mais que um saco para flechas sem que exista sistema de aljava.

Peso nunca é afetado pelo PEM. Empacotar bem não muda a massa, então a penalidade de movimento de O-015 não tem como ser burlada arrumando a mochila.

**Aceite:** o mesmo objeto guardado num recipiente comum e num recipiente `fittedFor` para ele consome volumes diferentes; o peso somado do portador é idêntico nos dois casos.

### O-003 — Recipiente é volume, não contagem
`P0` · `V2` · decisão · dep: O-002, W-032

Um recipiente declara volume interno (`containerVolume`) e aceita o que se guarde nele enquanto a soma dos volumes efetivos couber. Não existe limite de quantidade em lugar nenhum: sessenta agulhas cabem num estojo porque somam pouco, e uma bigorna não cabe numa bolsa larga porque soma muito. Isto substitui a capacidade por contagem de W-032.

Recipiente dentro de recipiente conta pelo **maior** entre o próprio volume efetivo e a soma do que carrega. A regra existe para fechar o ganho infinito de guardar sacos dentro de sacos, e escolhe o lado certo do erro: aninhar nunca cria espaço, e um saco meio vazio dentro de um baú continua ocupando o vão que ele realmente faz.

**Aceite:** guardar um objeto cujo volume efetivo excede o volume livre é recusado com retorno diegético, e o mesmo objeto entra depois que outro é retirado; encher um saco e guardá-lo num baú consome no baú o volume do conteúdo, não o do saco vazio.

---

## Composição

### O-004 — Objeto composto
`P1` · `V2` · decisão · dep: O-001, W-030

Um objeto pode ser feito de outros objetos. Conforme `CompositeStructure`: a lista dos componentes e o **grafo de conexão** entre eles. Uma panela é o caldeirão de ferro mais o cabo de madeira, e o que liga os dois é uma aresta.

Para a física do jogo o composto é **um corpo só**: uma posição, uma rotação, uma velocidade, uma entrada na ocupação da célula (W-066), um alvo de arremesso. A composição não existe para partir o corpo em pedaços que se movem, e é justamente por não existir para isso que ela é barata. Ela existe por três razões concretas, e só por elas: o calor caminha pelas peças (O-006), quebrar uma peça solta o que dependia dela (O-016), e o peso vem de baixo em vez de ser inventado (O-005).

Cada componente continua sendo um exemplar com material, integridade, temperatura e estados próprios — ou seja, tudo de SPEC-R já se aplica peça por peça sem nada novo. É o mesmo movimento de B-003: não há segundo modelo de matéria, há a mesma matéria numa topologia diferente.

**Aceite:** um composto de três peças ocupa uma posição só e se move como um corpo só, e as três peças são inspecionáveis em separado, cada uma com seu material, integridade e temperatura.

### O-005 — O peso do composto vem da soma
`P1` · `V2` · decisão · dep: O-004

O peso de um composto é a soma dos pesos dos componentes, marcado como derivado no schema e nunca atribuído — a mesma disciplina de causa contra derivado de V-013. Trocar o cabo de madeira por um de ferro muda o peso da panela sem que ninguém edite o peso da panela.

O volume segue o mesmo princípio: soma dos volumes dos componentes, com o PEM do composto igual ao maior PEM entre as peças, porque o que atravanca um vão é sempre a peça mais desengonçada.

Isto é o que torna montagem improvisada (O-019) segura de permitir. Um objeto que ninguém previu nasce com peso e volume corretos porque eles não foram declarados por ninguém — foram contados.

**Aceite:** substituir um componente por outro de material mais denso altera o peso do composto sem edição de campo, e uma mutação que escreva direto no peso de um composto é rejeitada pela validação de schema como escrita em derivado.

### O-006 — A junta conduz calor
`P1` · `V2` · decisão · dep: O-004, R-008

Cada aresta do grafo carrega uma **eficiência térmica** de 0 a 255. A convergência de temperatura de R-008 passa a valer também entre componentes conectados, atenuada por esse fator: junta eficiente iguala as peças rápido, junta ruim mantém as duas em temperaturas diferentes por muito tempo.

O cabo de madeira de uma panela de ferro é o caso canônico, e é o mesmo mecanismo de uma alça isolante, de uma espada com guarda de couro e de um atiçador com ponta quente. O caldeirão cruza o ponto de dano por calor e o cabo continua tocável, então pegar pelo cabo funciona e pegar pela borda queima — sem uma linha escrita para panela. Junta eficiente faz o oposto: uma faca de cabo de ferro esquenta na mão de quem cozinha com ela.

Oito bits porque é a resolução que o fenômeno pede. Booleano isola-ou-não perderia exatamente o meio interessante, que é o cabo que esquenta devagar; número contínuo daria uma precisão que ninguém consegue calibrar nem perceber.

**Aceite:** aquecer o componente de ferro de um composto de junta ruim mantém o componente de madeira abaixo do seu limiar por um número de ticks proporcional ao fator declarado; com junta eficiente, os dois cruzam o limiar quase juntos.

### O-007 — Pilha é composto degenerado
`P1` · `V2` · decisão · dep: O-004, O-002

Um tipo pode declarar-se empilhável com um limite de 2 a 64 exemplares (`stackLimit`), e um exemplar representa a pilha inteira com `stackCount`. Sessenta e quatro flechas custam um registro de objeto, não sessenta e quatro.

O volume efetivo de uma pilha é o volume de um exemplar vezes a quantidade, vezes o PEM da definição atenuado pelo **fator de empilhamento** de `tuning.json` — um fator que nunca passa de 1, e é essa a única invariante que o dado precisa respeitar. Empilhar **é** o ato de tirar o vão de entre as peças, então o PEM de uma pilha é sempre igual ou menor que o dos exemplares soltos: flechas paralelas num feixe ocupam muito menos que as mesmas flechas jogadas na mochila.

A pilha é um composto degenerado — componentes idênticos, grafo sem nada interessante para dizer — e por isso não paga o grafo. O que ela herda do composto é a ideia central: muitos objetos, um corpo, um registro.

**Aceite:** uma pilha cheia ocupa volume efetivo menor que a mesma quantidade de exemplares soltos e custa um registro de objeto em vez de sessenta e quatro; retirar um da pilha produz um exemplar novo com o PEM de solto.

---

## Armazenar

### O-008 — Arrumar direito é uma ação
`P2` · `V4` · decisão · dep: O-003, V-002

Gastar uma ação e um tempo declarado organizando um local de armazenamento corta o PEM de tudo que está guardado ali entre os limites declarados em `tuning.json` — a intenção é uma faixa da ordem de cinco a trinta por cento —, sorteado no gerador semeado. O ganho vale até que algo entre ou saia dali.

É um dos requisitos mais baratos do documento e um dos que mais devolve. Espaço deixa de ser um teto e passa a ser algo que se administra: o agente meticuloso e o desleixado terminam com mochilas mensuravelmente diferentes sem que exista traço de personalidade ligado a arrumação, e "não cabe" deixa de ser um veredito e passa a ser um problema com solução. Um agente que precisa levar mais uma coisa tem o que tentar antes de escolher o que abandonar.

Affordance declarada, resolvida na engine sem mediação, pelo caminho de V-002.

**Aceite:** arrumar um baú cheio aumenta o volume livre dentro dos limites declarados e consome o tempo declarado; a mesma seed produz a mesma redução; e guardar uma coisa nova depois disso desfaz o ganho.

### O-009 — Guardado deixa de ser físico
`P0` · `V2` · decisão · dep: O-003, W-030

Objeto guardado — dentro de um recipiente, no inventário de alguém, ou na própria célula pelo caminho de W-067 — sai do mundo físico. Não entra na ocupação de W-066, não colide, não é atingível por arremesso, e não participa das ocasiões de vizinhança e de contato da matriz de reação com o que está lá fora.

Continua existindo com todo o seu estado: é desenhado quando o recipiente é aberto, converge de temperatura com o que o contém, e é destruído com ele. E continua participando das ocasiões **contínua** e de **imersão** dentro do seu recipiente, o que preserva o caso que importa: uma tocha acesa guardada num saco de pano acende o saco. O recipiente é a vizinhança do que está dentro.

Esta é a distinção que permite um baú com quarenta itens não custar quarenta corpos físicos por tick, e é a mesma disciplina de X-013 aplicada a objetos: existir é barato, participar da física é que custa.

**Aceite:** com quarenta objetos guardados num baú, nenhum deles é visitado pelo laço de física nem pela matriz por tick; uma tocha acesa guardada num saco de pano acende o saco.

---

## Líquido

Um recipiente que não pode conter água é um recipiente pela metade. Sem esta seção, `R-020` dá volume à poça e `O-003` dá volume ao baú, e não existe o meio entre os dois: sede só é saciável em cima da fonte, cozinhar não tem panela, e levar água para a roça é impossível. É a lacuna que separa "há líquido no mundo" de "líquido é algo que se administra".

### O-029 — Carga líquida
`P1` · `V4` · decisão · dep: O-003, R-020, R-021

Um `ObjectDef` pode declarar `liquidCapacity` em metros cúbicos, e um exemplar com essa capacidade carrega no máximo uma **carga**: material dominante, descritor opcional de uma a três palavras, volume e temperatura.

Essa é exatamente a representação que `R-021` já usa para a poça, e é de propósito. Carga e poça são a mesma coisa em lugares diferentes, então encher e verter não traduzem entre dois formatos, e não existe pergunta sobre o que acontece com a informação no caminho: nada acontece, porque não há caminho. Nenhuma tabela de componentes com proporções mora no recipiente.

O que se perde com isso é a receita: não há como representar "três partes de água e uma de álcool", e portanto não há alquimia por dosagem. O que se ganha é que verter o que não devia continua sendo expressível — "água com óleo", "água com sangue" —, e é essa a parte que produz cena. Se dosagem vier a importar, o lugar de mudar é `R-021`, e recipiente e poça mudam juntos porque são a mesma regra.

A capacidade é independente do `volume` de `O-001`: um cantil ocupa mais espaço na mochila do que a água que leva dentro, e a diferença é a parede.

**Aceite:** um cantil de capacidade declarada aceita até aquele volume e não mais; a carga aparece em percepção como dominante mais descritor, nunca como lista de volumes; e o cantil cheio e o vazio ocupam o mesmo espaço na mochila.

### O-030 — Encher, verter, beber
`P1` · `V4` · derivado · dep: O-029, B-019, V-002

Transferir líquido entre poça e recipiente, entre dois recipientes, ou do recipiente para a boca é affordance declarada, resolvida na engine sem mediação, pelo caminho de `V-002`. Transferir para um recipiente que já tem carga de material diferente aplica `R-021` sobre o resultado, e é assim que "água com óleo" nasce dentro do cantil pela mesma regra que a faria nascer no chão.

O peso da carga entra na carga transportada de `O-013` como qualquer outro peso, o que faz água ser cara de carregar sem que exista regra alguma sobre água ser cara de carregar.

Beber consome volume e satisfaz a sede de `B-019` pelo caminho normal das necessidades. Recipiente sem carga não oferece a affordance, e é isso que faz o cantil vazio ser um problema em vez de um objeto inerte.

**Aceite:** encher um cantil numa poça reduz o volume da poça no mesmo tanto que a carga aumentou; beber de cantil cheio move a sede e esvazia por volume; o cantil vazio não oferece beber; e um cantil cheio pesa mais na conta de `O-013` que o mesmo cantil vazio.

### O-031 — A carga troca calor e se perde quando o recipiente se perde
`P1` · `V4` · derivado · dep: O-029, O-006, O-016, R-007

A carga tem temperatura e converge com o recipiente pelo grafo de `O-006`, com o mesmo `thermalEfficiency` que já governa junta de composto. Panela de metal sobre fogo esquenta o que tem dentro depressa; odre de couro isola. Nada disso é regra sobre cozinhar: cozinhar é o que sobra quando calor, recipiente e material já estão ligados.

Recipiente destruído por `O-016`, ou tombado, devolve a carga ao tile como poça de `R-020`, na temperatura que tinha. Água quente derramada é água quente no chão, e o substrato reage a ela sem saber que veio de uma panela.

**Aceite:** panela com água sobre tile em chamas eleva a temperatura da carga a uma taxa maior que odre de couro com a mesma carga no mesmo tile; quebrar a panela cheia produz poça do volume e da temperatura que a carga tinha.

---

## Trânsito

### O-010 — Projétil é apenas um objeto com velocidade
`P1` · `V4` · decisão · dep: O-001, W-030

Não existe entidade projétil. Existe `velocity` em `WorldObject`: ausente ou zero é o caso da esmagadora maioria dos objetos e custa nada; presente e não nula significa em trânsito.

Uma pedra, uma faca, uma tocha acesa, uma panela, um pão e um cadáver arremessados são o mesmo caso, e qualquer objeto do mundo pode ser arremessado sem que nada precise declarar-se arremessável. O ganho narrativo é gratuito e grande: um agente encurralado numa cozinha tem uma dúzia de armas improvisadas ao alcance porque o sistema não sabe distinguir arma de utensílio.

**Aceite:** qualquer objeto pegável pode ser arremessado, e o caminho do arremesso não consulta categoria nem definição especial de projétil.

### O-011 — Arremesso resolve por raio instantâneo
`P1` · `V4` · decisão · dep: O-010, R-013, W-066

O trânsito **não** é integrado tick a tick. No instante do arremesso a engine traça um raio da origem na direção do alvo, resolve a primeira interseção — altura bloqueante do tile, ocupação da célula, agente, objeto físico solto, ou o fim do alcance derivado de massa, velocidade e capacidade de quem arremessou —, assenta o objeto ali e dispara a ocasião de **contato** de R-013 no mesmo tick. Quem decide se o raio parou no abrigo ou em quem estava atrás dele é a fração de ocupação de W-066.

A razão é econômica antes de ser estética, e vale enunciar porque a alternativa parece mais séria do que é. A simulação é celular e roda por tick de um minuto simulado. Um laço de física que avançasse posições sub-tick existiria para produzir exatamente o mesmo fato observável — a coisa saiu daqui, bateu ali, caiu no chão — ao preço de custo por objeto em trânsito, de uma família de bugs que nada aqui usa (tunelamento, ordem de resolução entre projéteis, reprodutibilidade sob velocidade de simulação variável) e de um estado a mais para serializar. Balística é não-objetivo declarado em SPEC-R e continua sendo.

O campo `velocity` permanece porque é o parâmetro do raio, não uma posição sendo integrada: direção e intensidade decidem alcance e energia de impacto (O-012), e o mesmo canal serve para queda, empurrão e desabamento. Nenhum objeto atravessa a fronteira de um tick em estado de voo.

**Aceite:** um arremesso resolve dentro do tick em que começou, com zero objetos em trânsito entre ticks; arremessar uma tocha acesa em palha acende a palha no mesmo tick e sem nenhuma chamada de LLM.

### O-012 — Impacto entra pelos caminhos que já existem
`P1` · `V4` · derivado · dep: O-011, R-027, B-020

A energia do impacto sai da massa e da velocidade, com os fatores em `tuning.json`. O tipo de dano sai do material, dentro do vocabulário fechado de `DamageType` e sem nenhuma entrada nova: objeto com a etiqueta `sharp` produz `pierce`, qualquer outro produz `blunt`. Daí em diante não há caminho novo — é R-027 para tiles e objetos, B-020 para corpos, e a matriz de reação para o que o contato desencadeia.

Consequência que é o ponto: arremessar uma faca em alguém e esfaquear alguém convergem no mesmo lugar, então uma facada arremessada produz laceração, sangramento, cobertura de sangue no tile e rastro seguível, sem que exista sistema de arremesso além do raio. Queda usa o mesmo canal apontado para baixo e entrega `blunt` (W-062). E o Validador não é chamado para nada disso, pela regra de V-007.

**Aceite:** uma faca e uma pedra de massa igual arremessadas contra o mesmo alvo produzem `pierce` e `blunt` respectivamente, pelos mesmos caminhos de um golpe corpo a corpo, com zero invocações do Validador.

---

## Carga

### O-013 — A carga é a soma do que o portador leva
`P0` · `V4` · decisão · dep: O-001, A-024

A carga de um indivíduo é o peso somado de tudo que ele leva: nas mãos, vestido e guardado, incluindo o peso dos recipientes e o de cada componente de cada composto. Não há desconto por estar guardado e não há desconto por arrumação — arrumar muda volume, nunca massa.

Escalar derivado, recomputado por invalidação quando o inventário muda, nunca por tick. Mesma disciplina de B-015, e pela mesma razão: é função pura de um conjunto que quase nunca muda.

**Aceite:** a carga de um agente é igual à soma dos pesos individuais do que ele leva, recipientes e componentes incluídos, e mil ticks sem alteração de inventário produzem zero recomputações.

### O-014 — Capacidade de carga
`P0` · `V4` · derivado · dep: O-013, B-012

A capacidade de carga em quilogramas parte de uma base declarada em `tuning.json` e é modulada pelas capacidades derivadas de `moving` e `manipulation` (B-012). Um braço quebrado reduz o que a pessoa consegue levar, e reduz sem que exista regra ligando braço a mochila — é a composição de B-012 fazendo o trabalho.

Acima de cem por cento da capacidade, pegar ou guardar mais uma coisa falha, com retorno diegético pela regra de V-006: a sensação de não dar conta, nunca uma mensagem de recusa. Abaixo disso, o excesso não é impedimento, é preço, e o preço está em O-015.

**Aceite:** um agente com o braço quebrado tem capacidade mensuravelmente menor que o mesmo agente são, e tentar pegar acima da capacidade devolve sensação em vez de linguagem de sistema.

### O-015 — Penalidade de movimento por carga
`P0` · `V4` · decisão · dep: O-014, A-005

A fração de capacidade em uso modula o `moveSpeed` de A-005, com um limiar abaixo do qual não há penalidade nenhuma e um piso abaixo do qual a velocidade não cai, os dois em `tuning.json`. O limiar existe para que ninguém ande devagar por causa de uma faca no cinto; o piso existe para que sobrecarga seja lentidão e não paralisia.

A carga **não** escreve em `capacities.moving`. Aquele valor é derivado de partes e condições (B-012), é recalculado por invalidação (B-015), e qualquer escrita nele seria apagada no recálculo seguinte — que é o defeito silencioso contra o qual V-013 existe. Peso não é lesão nem condição: entra no cálculo de velocidade ao lado da mobilidade, e não dentro dela.

O resultado é um dilema recorrente e barato: levar as ferramentas todas e chegar tarde, ou escolher três e voltar depois. Quem carrega o ferido não corre.

**Aceite:** o mesmo agente percorre o mesmo trajeto mais devagar carregando o dobro do peso; o fator nunca cai abaixo do piso declarado; e nenhuma escrita em `capacities.moving` acontece por causa de carga.

---

## Quebra e desmonte

### O-016 — Componente destruído desconecta
`P1` · `V4` · decisão · dep: O-004, R-027

Um componente cuja integridade chega a zero é destruído pelo caminho normal de R-027 — vira o escombro declarado no material — e **se desconecta**: as arestas dele somem do grafo. O que dependia dele através dele se solta, porque conectividade é o único critério.

Depois da remoção, o subgrafo que contém o componente de maior peso continua sendo o composto; cada outro subgrafo passa a ser um exemplar solto na posição em que o composto estava. Empate de peso resolve pela ordem de declaração dos componentes, para que a operação seja determinística sob replay. Peso e volume do que sobrou são recontados por O-005, sem edição de campo.

O caso é a cadeira, e nada disso está escrito para cadeira: quebre uma perna e a cadeira ainda é uma cadeira manca; quebre o assento e as quatro pernas caem soltas no chão, porque estavam ligadas entre si apenas através dele.

**Aceite:** destruir o assento de uma cadeira de cinco peças produz quatro exemplares soltos no chão; destruir uma perna produz um exemplar solto e um composto de quatro peças com o peso recomputado.

### O-017 — O composto perde o que dependia da peça
`P2` · `V4` · derivado · dep: O-016, W-031, O-021

As affordances e as regras de Funcionamento de um composto são as das suas peças. Uma affordance ou regra pode nomear, no seu gatilho, a peça de que depende; quando essa peça sai — quebrada, desmontada ou destruída —, ela deixa de ser oferecida. Regra que não nomeia peça sobrevive a qualquer quebra.

Uma panela sem cabo continua sendo recipiente e deixa de ser pegável quando está quente. Um machado sem cabeça continua sendo um pedaço de pau. É a versão composta do que R-028 já diz sobre ferramenta gasta, e é o que faz a quebra ser sentida em vez de apenas registrada: o agente descobre a perda tentando, e a recusa chega como sensação (V-006).

**Aceite:** quebrar o cabo de uma panela remove a affordance que o nomeava e preserva as outras; uma regra que não nomeia peça continua valendo no que sobrou.

### O-018 — Desmontar é o mesmo caminho, sem dano
`P2` · `V4` · derivado · dep: O-016, A-022

Desmontar de propósito percorre exatamente o caminho de O-016 sem passar por dano: as arestas escolhidas somem, os subgrafos viram exemplares soltos, peso e volume são recontados. Nenhum mecanismo novo.

O que separa arrancar de desmontar direito é tempo e habilidade. Com habilidade de artesanato (A-022) acima do limiar declarado em `tuning.json`, as peças saem íntegras; abaixo, saem com dano `blunt` proporcional à falta, o que às vezes destrói a peça e é exatamente o resultado que a cena pede.

Isso dá desmanche, canibalização de peças e conserto improvisado — três comportamentos úteis — pelo preço de uma affordance.

**Aceite:** desmontar uma panela produz caldeirão e cabo como exemplares soltos cuja soma de pesos é o peso da panela; feito por alguém sem habilidade, ao menos uma peça sai com integridade reduzida.

### O-019 — Montar é composição, não receita
`P2` · `V4` · decisão · dep: O-004, V-008

Juntar coisas é uma ação como qualquer outra. Não existe árvore de receitas, catálogo de combinações válidas nem estação de trabalho. Quando um agente tenta unir peças e nenhuma affordance cobre a tentativa, o Validador julga por V-008 e, materializando, emite a criação do composto com as juntas e as eficiências térmicas que julgar plausíveis, dentro do vocabulário fechado de `CompositeStructure`. Se o julgamento generaliza, a montagem seguinte igual não custa chamada (O-024).

É por isso que crafting com árvore de receitas é não-objetivo e não faz falta. O mecanismo genérico cobre o caso previsto e cobre também o imprevisto — amarrar uma pedra num galho, prender uma faca num cabo de vassoura, emendar dois cabos quebrados — enquanto uma árvore de receitas seria um catálogo do que já funciona e, pior, uma lista do que passaria a ser proibido.

**Aceite:** um agente monta um objeto composto que não existe em nenhum catálogo, o exemplar resultante tem peso somado e grafo válido, e a segunda montagem idêntica ocorre sem invocação do Validador.

---

## Descrição, crença e funcionamento

### O-020 — Toda coisa tem duas descrições
`P0` · `V2` · decisão · dep: W-029, R-037

Todo objeto declara uma descrição **sensorial** e uma **funcional**, e a fronteira entre elas é a mais importante deste documento.

A sensorial é pública: tudo que pode ser percebido por qualquer sentido — forma, tamanho aparente, estética, cheiro, som, textura, o que se sente ao tocar. É o que entra na percepção de quem quer que perceba o objeto, pelo canal de R-037, sujeito a distância, luz e oclusão. Ela **nunca** contém como a coisa funciona.

A funcional é oculta dos agentes: o que o objeto faz de fato e por quê. É a fonte que o Validador consulta ao julgar um uso, e nada dela chega a nenhum prompt de agente em nenhuma circunstância. A exposição dessa descrição ao Validador é V-043; o adendo que um julgamento pode acrescentar a cada uma das duas, preservando o lado de cada coisa, é V-042.

A separação é o que torna o erro possível e plausível. O agente decide o que fazer com uma coisa pela aparência dela e pela própria crença (O-022), nunca pela verdade. Sem essa fronteira todo mundo saberia usar tudo — e um mundo onde ninguém erra é um mundo onde ninguém aprende, ninguém ensina, ninguém pergunta e ninguém tem o que contar. É também o que permite que um objeto guarde segredo: uma coisa bonita cuja função ninguém adivinhou é um enigma que a comunidade vai discutir.

⚑ A glosa de uma linha do catálogo continua existindo para listas e menus, e não é nenhuma das duas.

**Aceite:** o contexto de percepção de um agente contém a descrição sensorial; uma varredura automática não encontra descrição funcional em nenhum prompt de agente; o prompt do Validador contém as duas.

### O-021 — O Funcionamento resolve o uso sem mediação
`P0` · `V4` · decisão · dep: O-020, W-031, V-002

Cada definição carrega um **Funcionamento**: um conjunto de regras determinísticas, conforme `ItemRule`, que interceptam tentativas de uso e as resolvem sem modelo. Cada regra tem um gatilho, um desfecho — habilitar, recusar, ou executar um efeito nomeado de R-015 — e o texto diegético do que o agente sente.

É o affordance-first de W-031 e V-002 levado até onde ele realmente paga. A affordance diz que a ação existe; o Funcionamento diz o que ela faz, e diz também o que ela recusa e como a recusa é sentida. A recusa importa tanto quanto a permissão: "a lâmina desliza na pedra sem morder" é uma resposta que ensina, e ela é dado, não chamada.

O Funcionamento inicial vem do catálogo, em `config/objects.json`. Ele cresce ao longo da partida por O-024, e é aí que o custo do documento se paga.

**Aceite:** uma tentativa de uso coberta pelo Funcionamento resolve com zero chamadas de LLM e devolve texto diegético.

### O-022 — A crença mora só na divergência
`P1` · `V5` · decisão · dep: O-020, C-002

Cada indivíduo tem a própria crença sobre o que cada tipo de objeto faz. O registro dessa crença, conforme `ItemBelief`, **só existe quando ela diverge** da descrição funcional verdadeira. Sem registro, o agente herda o entendimento correto.

A decisão é de custo e é ela que torna o resto viável. O estado não cresce com agentes × itens, e sim com agentes × mal-entendidos, que é uma quantidade pequena, estável e narrativamente densa. E vem de brinde uma propriedade que valeria a decisão por si só: **o registro existir já significa que aquele indivíduo entende errado**. Não é preciso comparar nada com nada para saber quem está enganado sobre o quê — basta listar, e a lista é curta o bastante para caber num painel e num prompt.

Divergência nasce de três lugares: a geração inicial pode semear mal-entendidos coerentes com o perfil de quem não teve como aprender; um agente que vê outro usar algo errado, ou ouve um relato falso (C-019), passa a divergir; e o Validador pode registrar divergência ao julgar um uso improvisado que revelou menos do que o agente concluiu.

**Aceite:** um mundo recém-gerado em que ninguém entende nada errado não guarda nenhum registro de crença; a crença entra no contexto de pensamento apenas quando existe registro, e nesse caso substitui o entendimento correto.

### O-023 — A crença é revisada ao ser contrariada
`P1` · `V5` · derivado · dep: O-022, R-037

Quando o agente percebe um fato que contradiz a própria crença — usou e não funcionou, viu funcionar de outro jeito, ouviu de quem tem crédito —, a crença é revisada. A revisão que converge para a verdade **apaga o registro**: o agente volta a ser alguém que entende aquilo, e o estado encolhe sozinho.

Ninguém é chamado só para isso. Quem revisa é quem já estava sendo chamado: o Validador que acabou de julgar o uso devolve a crença corrigida na mesma resposta, e a percepção que demonstra a função verdadeira apaga o registro sem chamada nenhuma. Não existe caminho em que uma chamada de LLM tenha como único propósito revisar crença sobre item.

A revisão também não passa pelo classificador de dissonância de C-025, e a fronteira é deliberada. Opinião é sobre gente e sobre valor, e rompê-la é evento social caro, com limiar de teimosia e cascata de metas. Entender errado uma ferramenta é falha de conhecimento e se corrige na hora, com o fato na frente dos olhos. Tratar as duas coisas pelo mesmo caminho encareceria a segunda sem enriquecer a primeira.

**Aceite:** um agente cuja crença errada é contrariada por um uso presenciado tem o registro reescrito ou apagado no mesmo ciclo, sem nenhuma chamada dedicada e sem passar pelo classificador de dissonância.

### O-024 — Julgamento que generaliza vira Funcionamento
`P1` · `V4` · decisão · dep: O-021, V-024, V-041 · prompt: `gm.evaluate_high`

Quando alguém tenta um uso que nenhuma regra cobre, o Validador julga — e decide também se aquele julgamento **generaliza** para o tipo de objeto, caso em que a promoção tem como destino o Funcionamento em vez da matriz do substrato, conforme V-041. O que este requisito acrescenta é o que acontece do lado do objeto: a regra é escrita como `ItemRule` dentro da definição, e passa a responder por toda tentativa igual sobre todo exemplar daquele tipo.

O ciclo de vida é o mesmo das regras provisórias de V-025 — provisória, permanente ou rejeitada; viva desde o instante em que nasce, porque uma fila de aprovação humana antes da ativação devolveria exatamente o custo que o mecanismo existe para eliminar; revisável no painel de U-022, com contagem de disparos e ponteiro para o julgamento de origem. Rejeitar impede disparos futuros e não desfaz o que já aconteceu.

O registro vive na definição do objeto, e não como `ProvisionalRule` de domínio próprio, porque a regra é expressa no vocabulário do próprio objeto — gatilho de uso, desfecho, efeito nomeado — e não no vocabulário fechado de nenhum dos domínios de V-022.

É aqui que o documento se paga. O primeiro agente que tenta usar uma foice como arma custa uma chamada; o segundo não custa nada, nem o terceiro, e a definição da foice fica permanentemente mais rica do que o catálogo a criou. Um mundo antigo é mais barato de simular que um mundo novo.

**Aceite:** o mesmo uso improvisado, repetido depois de um julgamento que generalizou, resolve pelo Funcionamento sem nova invocação do Validador, e a regra aparece no painel com origem e contagem de disparos.

### O-025 — O que dos objetos entra no prompt
`P0` · `V4` · decisão · dep: O-020, O-022, C-002

O contexto de um agente recebe, sobre os objetos em escopo, a descrição sensorial em prosa e — apenas quando existe registro — a própria crença divergente. Nada mais: nem descrição funcional, nem lista de regras do Funcionamento, nem tabela de peso, volume e PEM.

Carga entra como sensação, pelo mesmo tratamento que B-030 dá ao corpo: "você está carregando mais do que consegue levar bem" e não `carga: 41,2 / 35,0`. O bloco de objetos cabe num orçamento de tokens declarado em `tuning.json`, e o que é omitido por padrão é o que não decide nada — item guardado e irrelevante para a intenção corrente, grandeza física de coisa que ninguém está tentando levantar.

Sem este requisito, todo o resto do documento se transforma em custo de token por pensamento, que é o único custo do projeto que importa de verdade.

**Aceite:** o bloco de objetos do contexto de pensamento cabe no orçamento declarado, e uma varredura automática não encontra descrição funcional nem regra de Funcionamento em nenhum prompt de agente.

---

## Custo

### O-026 — Objeto parado custa zero
`P0` · `V2` · decisão · dep: O-009, X-013

Só entram no laço de objetos os exemplares que têm algo acontecendo: velocidade no tick corrente, estado transiente ativo, temperatura divergindo do ambiente além do limiar, ou uma junta transmitindo calor entre peças de temperaturas diferentes. Um baú, uma cadeira e mil pedras num campo não são visitados.

É a mesma disciplina de R-014 e de B-046, e é ela que permite um mundo com muitos objetos. Objetos são, de longe, a categoria mais numerosa do estado, e a única razão pela qual isso não é um problema é que a esmagadora maioria deles está parada e em equilíbrio térmico.

**Aceite:** um mundo com dois mil objetos parados e em temperatura ambiente executa zero iterações no laço de objetos por tick.

### O-027 — Determinismo
`P0` · `V2` · derivado · dep: R-047, X-004

Toda aleatoriedade deste documento vem do gerador semeado: a redução de PEM ao arrumar, o dano do desmonte sem habilidade, a resolução do impacto. Onde há empate — qual subgrafo continua sendo o composto, em que ordem duas peças convergem de temperatura —, o desempate é pela ordem de declaração, nunca por ordem de iteração de estrutura de dados.

**Aceite:** mesma seed e mesmas ações produzem inventários, pilhas, compostos e desmontes idênticos entre duas execuções em replay.

### O-028 — Tudo em dado
`P0` · `V2` · decisão · dep: R-050, X-008

Peso, volume, PEM, limite de pilha, volume interno, `fittedFor`, juntas com suas eficiências térmicas e o Funcionamento inicial vivem em `config/objects.json`, validados por schema. Limiares, fatores e faixas vivem em `tuning.json`. Código implementa mecanismo; dado descreve as coisas.

**Aceite:** é possível acrescentar um objeto composto novo, com juntas, pilha e Funcionamento próprio, sem tocar em arquivo `.ts`.

---

## Não-objetivos

**Física de corpo rígido.** Sem rotação com momento, colisão contínua, empilhamento estável ou atrito. Objeto em trânsito resolve por raio (O-011) e objeto parado é um ponto com um envelope. Os fatos que a narrativa usa — saiu daqui, bateu ali, caiu no chão, quebrou — saem inteiros disso, e o resto seria orçamento de tick gasto onde nenhuma memória se forma.

**Inventário como quebra-cabeça espacial.** Sem grade de mochila, sem encaixe, sem rotação de item para caber. O PEM existe precisamente para comprar o efeito interessante do encaixe — o objeto desengonçado que desperdiça espaço — por uma multiplicação em vez de por um solucionador geométrico e uma tela de arrastar.

**Durabilidade por componente separada da integridade.** A integridade unificada de R-028 já absorve dano estrutural e desgaste, e cada componente de um composto tem a sua. Um segundo escalar de vida por peça só existiria para ser exibido, e `wear` já foi aposentado uma vez.

**Economia, preço e valor de mercado.** Nenhum objeto carrega valor monetário. Escassez existe fisicamente, dar e receber são atos sociais julgados como tais, e é dessas duas coisas que sai a disputa por recursos. Preço é uma camada de abstração que substituiria conversa por aritmética.

**Crafting com árvore de receitas.** Montar existe em O-019; receita não. Uma árvore de combinações válidas seria um catálogo do que o mecanismo genérico já resolve e, sobretudo, uma lista do que ele passaria a proibir.

**Objeto com agência.** Um objeto não quer nada, não age sozinho e não tem estado interno além do que este documento declara. O Funcionamento é uma tabela de respostas, não uma mente.

O objeto aqui existe para produzir três coisas: **atrito** que obriga a escolher, **conhecimento desigual** que faz alguém estar errado sobre algo, e **fato perceptível** que dá aos outros o que comentar. O que não serve a uma dessas três não entra.
