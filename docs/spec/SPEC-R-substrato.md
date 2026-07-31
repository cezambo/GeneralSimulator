# SPEC-R — Substrato reativo

A engine base do simulador: o conjunto de sistemas que produz consequência física, química, perceptual e fisiológica **sozinho**, sem consultar LLM, e cujo vocabulário fica inteiramente exposto ao Validador.

Fundamentação e origem das escolhas em [07-REFERENCIAS-SISTEMICAS.md](../07-REFERENCIAS-SISTEMICAS.md).

Este documento absorve e substitui o que eram os requisitos `W-015` a `W-028`. Aquelas faixas de identificador ficam aposentadas em SPEC-W e não devem ser reutilizadas.

**O critério que decide o que entra aqui:** o sistema produz fato que um agente pode perceber e sobre o qual vale a pena pensar. Fumaça entra, porque esconde. Sangue entra, porque acusa. Estequiometria não entra.

---

## Fundamentos

### R-001 — Etiquetas como unidade de classe
`P0` · `V1` · decisão · dep: —

Todo material, objeto, tile e criatura carrega um conjunto de etiquetas (`inflamável`, `condutivo`, `líquido`, `orgânico`, `frágil`, `respirável`). **Nenhuma regra do substrato referencia um identificador específico** — todas referenciam etiquetas.

Consequência que justifica a regra: um objeto inventado pelo usuário em tempo de execução (W-034) participa de todos os sistemas no instante em que recebe suas etiquetas, sem que ninguém escreva uma linha de regra para ele.

**Aceite:** criar um material novo com a etiqueta `inflamável` e nenhuma outra configuração faz com que ele pegue fogo por todos os caminhos que qualquer inflamável pega.

### R-002 — Distinção entre elemento e material
`P0` · `V1` · decisão · dep: R-001

Duas categorias, exclusivas:

- **Material** — identidade estável da matéria. Madeira, pedra, pano, carne, óleo. Não muda por conta própria.
- **Elemento** — condição instável que ocupa um tile ou objeto. Fogo, água, gelo, eletricidade, fumaça, veneno.

**Aceite:** o catálogo classifica cada entrada em exatamente uma das duas categorias, e a validação recusa entradas ambíguas.

### R-003 — A regra dos três
`P0` · `V1` · decisão de BOTW · dep: R-002

A matriz de reação admite exatamente três formas, e nenhuma outra:

1. Elemento altera estado de material.
2. Elemento altera estado de elemento.
3. **Material não altera estado de material.**

A terceira é a que impede a explosão combinatória: sem ela, o espaço de regras é quadrático no número de materiais.

Isto **não** proíbe que dois objetos interajam. Pedra ainda quebra vidro. Interação mecânica — impacto, peso, atrito, corte — é física resolvida por escalares (R-006), não química resolvida pela matriz. A proibição é específica: dois materiais não reagem *quimicamente* entre si sem um elemento no meio.

**Aceite:** o verificador de contratos rejeita, com erro nomeado, qualquer regra cujos dois lados sejam materiais.

### R-004 — Estado transiente
`P0` · `V1` · decisão · dep: R-002

Tiles, objetos e criaturas carregam um conjunto de estados, cada um com tipo, intensidade de 0 a 100, e duração restante. Vários coexistem: um tile pode estar simultaneamente molhado, gelado e manchado.

Estado **persiste** onde está até que uma regra o mude ou sua duração acabe.

**Aceite:** o mesmo tile aceita três estados ativos e cada um decai no seu próprio ritmo.

### R-005 — Campo calculado
`P0` · `V2` · derivado · dep: R-004

Distinto de estado. Um campo não tem memória persistente própria: é **derivado** de emissores e atenuado por distância e oclusão. Luz, som e odor entram aqui.

**Invalidação, não recálculo global (R-049):** campos só são recomputados quando emissores, oclusores ou entidades em escopo mudam — nunca varrem o grid inteiro a cada tick. Remover a fonte de luz apaga o campo no tick seguinte para os tiles afetados, sem varrer o mapa.

**Aceite:** remover a fonte de luz apaga o campo no tick seguinte sem varrer tiles sem emissor; perfil de CPU não escala com tamanho total do mapa quando poucos emissores mudam.

### R-006 — Escalar antes de regra
`P0` · `V1` · decisão de DF · dep: R-004

Regra de desenho, verificada em revisão e não em teste: **antes de escrever uma reação discreta, verificar se ela não é um limiar sobre um escalar que já existe.**

Escalares do substrato: temperatura, saturação, integridade, carga elétrica, frescor.

Cada material declara seus limiares sobre cada escalar e sua resistência à mudança. Derreter, congelar, ferver, incendiar e sofrer dano por calor deixam de ser cinco regras e passam a ser cinco números.

**Aceite:** a matriz não contém nenhuma reação que poderia ser expressa como limiar sobre escalar existente. Verificado na revisão de `config/reactions.json`.

---

## Temperatura

### R-007 — Temperatura como escalar por entidade
`P0` · `V1` · decisão de DF e Qud · dep: R-006

Todo tile, objeto e criatura tem uma temperatura. O mundo tem uma temperatura ambiente que varia com hora, estação e clima (W-054, W-055).

**Aceite:** inspecionar qualquer entidade mostra sua temperatura corrente.

### R-008 — Convergência com resistência por material
`P0` · `V1` · decisão de DF · dep: R-007

A cada tick a entidade move sua temperatura em direção à do ambiente e à das entidades em contato, pela diferença dividida pelo **calor específico** do material.

Calor específico alto significa mudar devagar. Pedra demora; ar não.

**"A cada tick" vale para entidade com gradiente, não para o mapa inteiro.** Tile em equilíbrio com a temperatura ambiente não guarda temperatura própria e não entra no laço: ele *é* o ambiente, e ler sua temperatura devolve a ambiente. Ele só passa a existir como entidade térmica quando alguma coisa cria diferença ali — fogo, poça, corpo, vizinho já divergente —, e volta a sumir quando reconverge dentro da tolerância declarada em `tuning.json`.

Sem esta frase, `R-007` e `R-008` lidos ao pé da letra mandam converger 262 mil floats por tick por grid, o que sozinho estoura o orçamento de `R-049` com o mapa vazio e dez agentes parados — e contradiz `X-013`, que é a regra que faz o mundo de 512 caber. O campo de temperatura é esparso com padrão igual ao ambiente, como pressão (`W-068`) e gravidade (`W-065`), e pela mesma razão: quase todo o mapa, quase sempre, não tem nada a dizer.

**Aceite:** dois materiais com calor específico diferente, expostos à mesma fonte, atingem o mesmo limiar em números de ticks proporcionalmente diferentes; e num mapa 512×512 sem nenhuma fonte de calor, o número de entidades visitadas pelo laço térmico por tick é zero.

### R-009 — Limiares térmicos por material
`P0` · `V1` · decisão de DF · dep: R-008

Cada material declara, cada um opcional: ponto de fragilização, congelamento, fusão, ebulição, ignição, dano por calor e dano por frio.

Cruzar um limiar dispara a transição correspondente automaticamente. Não há regra na matriz para isso — é aritmética.

**O limiar é conferido antes da convergência do tick, e não depois.** Material de calor específico baixo converge por inteiro num tick só; conferir depois seria conferir a temperatura ambiente, e gelo largado a quarenta graus voltaria a vinte sem nunca ter passado pelo ponto de fusão. A transição pertence à temperatura com que a entidade chegou ao tick, não àquela com que ela sai.

**Aceite:** gelo aquecido acima do ponto de fusão vira água sem que exista reação declarada ligando fogo a gelo, inclusive quando seu calor específico o faria reconverger no mesmo tick.

### R-010 — Fontes de calor e frio
`P0` · `V1` · derivado · dep: R-008

Entidades com o estado `queimando`, materiais de temperatura base alta como lava, e o clima elevam a temperatura da vizinhança; corpos d'água, gelo e noite a reduzem.

Uma entidade pode ter temperatura fixa, imune à convergência, para casos deliberados.

**Aceite:** uma fogueira aquece progressivamente os tiles vizinhos, com intensidade decrescente pela distância.

### R-011 — Consequência derivada, não declarada
`P0` · `V1` · decisão de Qud · dep: R-009

Quando uma consequência puder emergir de propriedades, ela **não** é escrita como regra. Lava não tem regra "lava destrói recipiente": lava tem temperatura base alta, o recipiente aquece, cruza seu ponto de dano por calor, e se destrói.

**Aceite:** nenhum caso especial nomeado para lava, magma ou fonte de calor extremo existe em código ou em dado.

---

## Matriz de reação

### R-012 — Reação como regra de reescrita
`P0` · `V1` · decisão de Noita · dep: R-003 · dados: `config/reactions.json`

Uma reação é: duas entradas, duas saídas, uma probabilidade e uma ocasião. Entradas e saídas são etiquetas ou identificadores; a probabilidade **é** a taxa, sem sistema de velocidade separado.

```json
{
  "id": "ignition-by-contact",
  "when": "contact",
  "in": ["#ignitionSource", "#inflammable"],
  "effect": "ignite",
  "chance": 0.9,
  "modifiedBy": { "wet": -0.8, "flammabilitySpeed": 0.2 },
  "porque": "Chama desprotegida encostando em material que queima acende o material."
}
```

**`modifiedBy` é somado à chance base, não multiplicado.** Lido como multiplicador, `wet: -0.8` significaria "reduz para 20%", que ainda acende madeira encharcada quase uma vez em cinco; somado, ele leva 0,9 a 0,1 e a zero conforme a saturação sobe, que é o que a prosa da regra descreve. Cada modificador nomeia um estado do alvo, um número do material ou uma propriedade booleana, e vale de 0 a 1 — intensidade de estado dividida por cem, número do material tal como está, propriedade presente valendo um.

Modificador que não encontra nada a que se referir é **ignorado**, e não tratado como zero. São a mesma coisa aritmeticamente e não são a mesma coisa na depuração: ignorado pode ser reportado como "esta regra citou `windToward` e não havia vento", que é a diferença entre uma regra inerte e uma regra errada.

Identificadores em inglês, como no resto dos contratos de dado. O campo `porque` é a exceção deliberada: é prosa, e é obrigatório, porque tem dois leitores — o humano que ajusta e o Validador, que recebe a matriz resumida em linguagem natural (R-042).

Exemplo completo em [`config/reactions.example.json`](../../config/reactions.example.json).

**Aceite:** acrescentar uma entrada ao arquivo passa a valer sem recompilar, e o verificador de contratos recusa entrada sem `porque`.

### R-013 — Ocasiões de avaliação
`P0` · `V1` · decisão · dep: R-012

Cinco ocasiões, e a regra declara em qual vale:

| Ocasião | Quando avalia | Exemplo |
|---------|---------------|---------|
| **contínua** | a cada tick sobre a entidade com o estado | tile em chamas perde integridade |
| **vizinhança** | a cada tick entre células adjacentes | fogo salta para o vizinho inflamável |
| **contato** | no instante em que duas entidades se encostam, colidem, ou uma é arremessada contra a outra | tocha encosta na cortina |
| **imersão** | quando uma entidade entra ou é posta dentro de outra | item cai no rio |
| **ingresso** | quando uma criatura pisa ou entra no tile | pisa na poça eletrificada |

A ocasião de **contato** é a que garante que ações físicas óbvias não precisem do Validador. Encostar, derrubar, arremessar, empurrar contra e mergulhar são caminhos causais modelados — o Validador não é consultado para nenhum deles.

**Aceite:** uma reação de contato dispara no mesmo tick da colisão, e arremessar objeto em chamas contra tile inflamável acende sem nenhuma chamada de LLM.

### R-014 — Execução autônoma
`P0` · `V1` · decisão · dep: R-013

A engine avalia a matriz a cada tick sobre as entidades com estado ativo. Nenhuma consulta a modelo, em nenhuma circunstância.

**Aceite:** um incêndio completo, do início à extinção, ocorre com zero chamadas de LLM.

### R-015 — Vocabulário de efeitos nomeados
`P0` · `V1` · decisão · dep: R-004

Conjunto fechado de transições de estado, implementadas uma vez na engine e invocáveis por identificador:

`ignite` · `extinguish` · `wet` · `dry` · `freeze` · `melt` · `electrify` · `shatter` · `stain` · `contaminate` · `illuminate` · `emit_gas` · `smother` · `corrode` · `rot` · `transmute`

Cada um carrega também um nome em português, usado na exibição e na descrição entregue ao Validador.

Todo efeito aceita **três espécies de alvo**: tile, objeto e parte de corpo. Não há vocabulário separado para corpo, porque o corpo é feito dos mesmos materiais (B-003). Molhar funciona nos três, corroer funciona nos três, e `transmute` — trocar o material do alvo preservando sua identidade e seu estado — é o que permite ao Validador transformar tanto uma parede quanto um fêmur.

Tanto a matriz quanto o Validador invocam pelo mesmo identificador e obtêm exatamente o mesmo comportamento.

**Aceite:** o mesmo efeito invocado pelos dois caminhos produz estado idêntico, e o mesmo efeito aplicado a um tile e a uma parte de corpo do mesmo material produz a mesma transição.

### R-016 — Propagação espacial
`P0` · `V1` · decisão · dep: R-014

Quatro modos, cada um com sua regra: fogo salta entre vizinhos inflamáveis com chance modulada por saturação e vento; líquido escorre para células de `baseHeight` igual ou menor; gás se difunde por células livres perdendo densidade; eletricidade percorre cadeias contíguas de material condutivo.

Os quatro são planos: a vizinhança de uma célula é o que está ao lado dela no mesmo grid. O que atravessa entre grids empilhados, e por onde, está em R-051; o que a altura contínua acrescenta a escoamento e assentamento está em R-052.

**Aceite:** óleo derramado escorre morro abaixo e, aceso numa ponta, queima ao longo de toda a poça.

### R-017 — Cadeias emergentes
`P0` · `V1` · decisão · dep: R-016

Efeitos disparam reações que disparam outros efeitos, sem profundidade máxima além de um teto de segurança por tick contra laço infinito. Nenhum caso especial escrito à mão.

**A cadeia e a propagação espacial andam em ritmos diferentes, e é deliberado.** Contato encadeia **dentro** do tick: um efeito aplicado reavalia as regras de contato com quem divide a célula, e é por aí que a poça eletrificada fere quem está nela no mesmo instante. Vizinhança avalia **uma vez por alvo por tick**, sobre a fotografia do conjunto ativo tirada no início do tick.

Sem essa separação o fogo atravessaria o mapa inteiro num tick, porque cada tile recém-aceso entraria na mesma varredura e acenderia o próximo — e a cadência espacial de R-016, que é o que faz um incêndio ser um evento com duração sobre o qual dá para decidir alguma coisa, deixaria de existir.

O teto de cascata (`substrato.maxPassosDeCascataPorTick`) não é otimização. `extinguish` gera `smoky`, e uma regra mal escrita que fizesse `smoky` gerar `extinguish` prenderia o tick num laço infinito. O teto troca um travamento por uma cadeia curta demais, que é um defeito que aparece.

**Aceite:** água derramada sobre piso condutivo com cabo energizado eletrifica a poça inteira e fere quem estiver nela no mesmo tick, sem que nenhuma regra descreva esse cenário; e o fogo leva três ticks para atravessar três tiles inflamáveis enfileirados, e não um.

### R-018 — Catálogo inicial de reações
`P0` · `V1` · decisão · dep: R-012

**Fonte de ignição** é qualquer entidade com chama desprotegida. Toda a família de ações de contato resolve pela mesma regra, sem depender do verbo usado.

| Condição | Ocasião | Efeito |
|----------|---------|--------|
| fonte de ignição encosta em inflamável | contato | `ignite` — cobre arremesso, encosto e queda |
| inflamável com chama adjacente | vizinhança | `ignite`, chance por velocidade de combustão e vento |
| chama + molhado | contato | `extinguish`, gera vapor |
| chama + orgânico por cima | contato | `smother` lento, gera fumaça densa |
| chama + óleo | contato | `ignite` imediato, alta propagação |
| condutivo + eletrificado adjacente | vizinhança | `electrify` em cadeia |
| molhado + eletrificado | contato | `electrify` da poça inteira |
| eletrificado + criatura | ingresso | dano e condição de choque |
| escorregadio + criatura em movimento | ingresso | risco de queda proporcional à pressa |
| frágil + impacto acima da dureza | contato | `shatter` |
| corrosivo + qualquer | contínua | perda de integridade |
| tóxico + líquido | contato | `contaminate` propagando pelo fluxo |
| qualquer + imersão em líquido | imersão | `wet` total |
| absorvente + líquido | contato | satura e deixa de escorrer |
| sangue, tinta ou fuligem + superfície | contato | `stain`, vestígio persistente |

Congelar, derreter, ferver e queimar por calor **não estão nesta tabela** por serem limiares térmicos (R-009).

**Aceite:** cada linha tem teste automatizado que verifica a transição.

### R-019 — Promoção
`P1` · `V2` · decisão de Brogue · dep: R-004

Um tipo de tile ou objeto declara em que se transforma, com que chance por tick, e sob quais gatilhos: por tempo, ao ser pisado, ao ser aceso, ao secar, ao apodrecer.

É a forma mais barata de cobrir crescimento de vegetação, cinza que assenta, poça que evapora, mofo que se espalha e cadáver que se decompõe — uma coluna a mais na tabela, não um sistema novo.

**Aceite:** grama num tile fértil se espalha para vizinhos ao longo de dias sem nenhum sistema de vegetação dedicado.

---

## Matéria

### R-020 — Líquidos como volume
`P1` · `V2` · decisão de Qud · dep: R-016

Líquido é medido em volume, não em presença. Uma poça tem quantidade, escorre conforme sua fluidez pelo relevo de `baseHeight` (R-052), e some quando o volume chega a zero.

**Aceite:** derramar dobro de volume produz poça que cobre mais tiles e demora mais para evaporar.

### R-021 — Mistura de líquidos
`P2` · `V3` · decisão de Qud · dep: R-020

Poça comprimida: **material dominante** (maior volume) + **descritor** opcional de 1–3 palavras quando a mistura importa narrativamente ("óleo na água"). Componentes internos existem para simulação, mas o que entra em percepção e no Validador é dominante + descritor — não lista de volumes.

**Aceite:** água misturada com óleo, deixada em repouso, termina como óleo puro na representação perceptível; poça composta aparece como "poça de óleo" ou "poça de água com óleo", nunca como tabela de volumes.

### R-022 — Absorção
`P1` · `V2` · derivado · dep: R-020

Materiais absorventes retêm líquido em vez de deixá-lo escorrer, ficam saturados, e liberam ao secar. Roupa molhada pesa mais, esfria quem a veste, e não pega fogo.

**Aceite:** pano encharcado exposto a chama não acende até secar.

### R-023 — Gases
`P1` · `V2` · derivado de Brogue e CDDA · dep: R-016

Gases ocupam a camada superior da célula, têm densidade, difundem-se para células livres, sobem ou descem conforme a densidade, e dissipam com o tempo. Fumaça, vapor, gás tóxico e poeira.

Subir e descer são movimento no plano enquanto não há para onde sair: gás leve satura a parte de cima do cômodo e gás pesado assenta nas células de solo mais baixo (R-052). Atravessar para o grid de cima ou de baixo exige abertura declarada (R-051).

**Aceite:** fumaça de uma fogueira em ambiente fechado preenche o cômodo e escapa pela abertura.

### R-024 — Gás bloqueia percepção
`P0` · `V2` · derivado · dep: R-023, A-006

Gás denso reduz alcance de visão proporcionalmente à densidade.

Este requisito é pequeno e importante: é o que transforma fumaça de efeito visual em **fato social**. Sem visão não há testemunha.

**Aceite:** um agente do outro lado de fumaça densa não registra o que aconteceu ali.

### R-025 — Coberturas
`P0` · `V2` · decisão de DF · dep: R-001

Qualquer substância pode cobrir qualquer tile, objeto ou parte de corpo. A cobertura tem substância, quantidade e frescor, persiste até ser removida, e é **descrita textualmente** onde quer que a entidade seja inspecionada.

Sangue nas mãos, fuligem no rosto, lama nas botas, vinho na túnica.

**Aceite:** inspecionar um agente lista suas coberturas em linguagem natural.

### R-026 — Remoção de cobertura
`P1` · `V2` · derivado · dep: R-025

Coberturas saem por lavagem, chuva, fricção ou tempo, cada substância no seu ritmo. Algumas nunca saem por completo.

**Aceite:** lavar as mãos remove sangue fresco; sangue seco exige mais de uma tentativa.

### R-027 — Integridade e destruição
`P1` · `V1` · derivado · dep: R-006

Tiles e objetos têm integridade de 0 a 100. Zero destrói e substitui pelo escombro declarado no material. Dano vem de fogo, corrosão, impacto, degradação e mutação do Validador, e cada material tem resistência própria por tipo de dano.

**Aceite:** uma parede de madeira queima até zero e vira escombro atravessável.

### R-028 — Integridade unificada
`P2` · `V3` · derivado · dep: R-027

Tiles e objetos têm **integridade** de 0 a 100, que absorve tanto dano estrutural quanto desgaste por uso. Qualidade de fabricação modula a taxa de perda. Zero destrói e substitui pelo escombro declarado no material.

⚑ `wear` como campo separado foi **aposentado** — desgaste incrementa integridade negativamente ou reduz eficácia via limiar, não via segundo escalar.

**Aceite:** ferramenta muito usada realiza tarefa mais devagar antes de quebrar; objeto com integridade zero perde affordances.

---

## Corpo

### R-029 — Substância com payload
`P0` · `V5` · decisão de DF · dep: R-025

Uma substância pode carregar um pacote de efeitos sobre um corpo, com atraso, duração e severidade. Um mecanismo, e dele saem veneno, peçonha, álcool, remédio, droga, alergia, doença e fumaça inalada.

**Aceite:** definir uma substância nova com payload não exige código, só dado.

### R-030 — Vetores de entrada
`P0` · `V5` · decisão de DF · dep: R-029

Quatro caminhos, declarados por substância:

| Vetor | Como entra |
|-------|-----------|
| **contato** | cobre pele exposta — respingo, poça pisada descalço, chuva, contato com quem está contaminado, ser golpeado por item sujo |
| **inalação** | está em estado gasoso e foi respirada |
| **ingestão** | foi comida ou bebida, **inclusive como ingrediente de algo preparado** |
| **injeção** | entrou por ferida ou arma contaminada |

A cláusula da ingestão é a que faz a substância viajar pela cadeia de produção sozinha: ninguém precisa escrever "torta envenenada".

**Aceite:** envenenar um ingrediente e cozinhar com ele transmite a substância a quem come o prato, sem regra específica para o prato.

### R-031 — Efeito cognitivo de substância
`P0` · `V5` · decisão · dep: R-029, C-001

O payload pode alterar **cognição**, não só fisiologia: reduzir inibição, embotar dor, induzir sonolência, distorcer percepção, alterar humor.

É a extensão que importa para este projeto. Álcool não é um número de saúde — é um agente que decide diferente, e o estado alterado entra no contexto que vai ao modelo.

**Aceite:** um agente embriagado recebe, no prompt, a descrição do seu estado alterado, e o efeito é observável nas decisões ao longo de uma amostra.

### R-032 — Contágio
`P2` · `V6` · derivado · dep: R-030

Substâncias marcadas como contagiosas passam entre corpos por proximidade e contato, com probabilidade e período de incubação.

**Aceite:** uma doença introduzida em um agente atinge outros ao longo de dias sem intervenção.

### R-033 — Efeitos do ambiente sobre o corpo
`P0` · `V5` · decisão · dep: R-018, B-020

Estado de tile afeta quem está sobre ele: chama causa dor, dano e propaga o estado para o corpo; eletrificado causa choque e possível inconsciência; escorregadio derruba; contaminado adoece; fumaça reduz visão e consciência; frio e calor extremos causam dano progressivo.

**Aceite:** um agente que atravessa tile em chamas passa a queimar e sofre dano contínuo até ser apagado.

---

## Percepção

### R-034 — Campo de luz
`P0` · `V2` · derivado · dep: R-005

Emissores iluminam num raio; oclusores bloqueiam. O nível de luz de um tile determina o alcance de visão de quem está nele.

O piso entre dois grids alinhados é oclusor total: luz só passa por abertura, e a abertura se comporta como emissor secundário da intensidade que chega nela (R-051). É o que faz um porão ser escuro sem que exista regra de porão.

**Aceite:** apagar a única fonte de luz de um cômodo reduz o alcance de visão de todos os presentes.

### R-035 — Campo de som
`P1` · `V2` · derivado · dep: R-005

Eventos emitem som com intensidade; o som atenua por distância e é amortecido por paredes. Quem está no alcance percebe, mesmo sem linha de visão, com precisão de localização decrescente.

O piso amortece como uma parede do mesmo material, e não mais que isso: som é a única coisa que atravessa entre andares sem precisar de abertura (R-051). É o que faz o andar de cima ser um lugar de onde se escuta.

Grito, quebra de vidro, batida e desabamento são eventos audíveis — e o que faz um agente aparecer onde não estava.

**Aceite:** vidro quebrado num cômodo faz agentes de cômodos vizinhos registrarem um som e sua direção aproximada.

### R-036 — Odor derivado
`P2` · `V3` · derivado de DF · dep: R-005, R-025

Odor **não** é campo de difusão simulado tile a tile. Fontes (coberturas, decomposição, substâncias) marcam entidades com **`odorDescriptor`**: string de 1–5 palavras ("carne podre", "perfume doce"). Percepção combina descritor + distância + oclusão — sem grid de concentração.

**Aceite:** cadáver produz descritor detectável em cômodos adjacentes antes de ser visto; nenhuma estrutura de "campo de odor" persiste no save.

### R-037 — Tudo isto é perceptível
`P0` · `V2` · decisão · dep: A-006

Todo produto do substrato — estado, cobertura, campo, dano, mudança — entra na percepção do agente como fato observável, descrito em linguagem natural, sujeito a alcance, oclusão, luz e atenção.

Este é o requisito que justifica a existência de todos os outros. Um sistema físico que a cognição não enxerga é custo sem retorno.

O **como** está em `A-031`: cada produto vira um `PerceptibleFact` em prosa, montado deterministicamente e sem modelo. Este requisito diz que nada do substrato fica invisível; aquele diz como o visível chega ao prompt.

**Aceite:** para cada sistema deste documento existe pelo menos um fato correspondente que aparece no relato de percepção de um agente.

---

## Tempo e ambiente

### R-038 — Decomposição
`P1` · `V3` · derivado · dep: R-019

Matéria orgânica perde frescor com o tempo, mais rápido no calor e mais devagar no frio. Comida estraga, cadáver apodrece, e a decomposição emite odor e pode gerar substância nociva.

**Aceite:** comida deixada ao sol estraga em menos tempo que a mesma comida guardada em local frio.

### R-039 — Crescimento
`P2` · `V3` · derivado de Brogue · dep: R-019

Vegetação e mofo se espalham por promoção, condicionados a umidade, luz e fertilidade.

**Aceite:** um canto úmido e escuro desenvolve mofo ao longo de semanas.

### R-040 — Clima como motor do substrato
`P1` · `V3` · derivado · dep: W-055, R-007

Clima não é decoração. Chuva molha tudo o que está exposto, apaga fogo desprotegido, encharca roupas e enche poças. Vento modula propagação de fogo, gás e odor. Frio congela líquidos parados e causa dano por exposição. Calor acelera evaporação e decomposição.

**Aceite:** uma chuva apaga uma fogueira ao ar livre e satura os tiles descobertos, sem que exista regra específica ligando chuva a fogueira.

---

## Fronteira com o Validador

### R-041 — O substrato é exposto por inteiro
`P0` · `V4` · decisão · dep: R-015, V-005

O contexto do Validador inclui, para tudo em escopo: material e propriedades, estados ativos com intensidade, coberturas, temperatura, integridade, affordances, e **a lista de efeitos invocáveis sobre aquele alvo**.

"Tudo em escopo" inclui os corpos dos agentes presentes, pelas mesmas regras e no mesmo formato — a exposição biológica está detalhada em B-034, e não é um canal à parte.

Sem o display, o Validador não sabe que alavancas existem.

**Aceite:** ao mediar uma ação perto de uma cortina, o prompt do Validador mostra que a cortina é inflamável e que `ignite` é invocável sobre ela.

### R-042 — Resumo da matriz em linguagem natural
`P1` · `V4` · derivado · dep: R-012, R-041

O Validador recebe também um resumo do que a matriz já resolve sozinha, gerado a partir do campo `porque` das regras aplicáveis ao escopo.

É o que permite ao Validador saber quando **não** agir.

**Aceite:** o resumo é gerado a partir do arquivo de reações e acompanha qualquer alteração dele sem edição manual do prompt.

### R-043 — Invocação de efeito pelo Validador
`P0` · `V4` · decisão · dep: R-041

O Validador pode acionar qualquer efeito do vocabulário como mutação de tipo `engine_effect`. A partir da invocação **a engine assume**: o Validador acende, e quem propaga, consome e apaga é a matriz.

O papel é preciso: o Validador é a fonte de **causação nova**. A matriz sabe o que acontece dado que um estado existe; ela não sabe enumerar todas as maneiras que uma pessoa pode inventar de criar aquele estado. É essa lacuna, e só ela, que o Validador preenche.

**Invocação legítima:** um agente diz que está esfregando gravetos com força e velocidade. Não existe chama em lugar nenhum e nenhuma regra liga atrito a fogo. O Validador julga o método plausível, invoca `ignite` com intensidade baixa nos gravetos, e daí em diante a matriz cuida de tudo.

**Contraexemplo, onde o Validador não invoca nada:** um agente arremessa uma lamparina acesa contra uma cortina. Existe fonte de ignição, alvo inflamável e contato. A matriz resolve sozinha (R-018). O Validador apenas autoriza o arremesso.

**Aceite:** `engine_effect` com `ignite` produz comportamento subsequente idêntico ao de uma ignição disparada pela matriz.

### R-044 — Não-duplicação
`P0` · `V4` · decisão · dep: R-043

Antes de invocar, o Validador verifica se já existe caminho causal modelado para o resultado. Havendo, ele não invoca — autoriza a ação e deixa a matriz agir. Invocar sobre algo que a matriz já resolveria aplica o efeito duas vezes.

**Aceite:** arremessar objeto aceso contra inflamável não gera nenhuma invocação do Validador em uma amostra de execuções.

### R-045 — A fronteira, enunciada
`P0` · `V4` · PDF 116-118 refinado por decisão · dep: R-014, R-043

| | Quem resolve |
|---|---|
| Dado que um estado existe, o que acontece | matriz |
| Métodos **modelados** de criar um estado — contato, impacto, imersão, ingresso, adjacência | matriz |
| Métodos **não modelados** de criar um estado — atrito, lente e sol, improviso | Validador invoca, matriz continua |
| Simular a consequência depois que o estado existe | matriz, sempre |

O Validador nunca simula física. Decide apenas *se* um efeito começa, e só quando nenhuma regra já responderia isso.

**Aceite:** existe teste para cada linha da tabela.

### R-046 — Promoção generalizada
`P1` · `V4` · decisão · dep: R-043, B-045, X-006

Mecanismo **único** para improviso que vira regra — vale para substrato, corpo, social, cognição, comunidade e objeto. Contrato na saída do Validador (`generalization`):

```json
{
  "verdict": "systemic" | "one_off",
  "domain": "substrate" | "body" | "social" | "cognition" | "community" | "object",
  "rule": { /* só se verdict==systemic; vocabulário fechado do domínio */ },
  "reasoning": "..."
}
```

**Vocabulários fechados por domínio:**
| Domínio | Forma de `rule` |
|---------|-----------------|
| `substrate` | `{ when, in, effect, chance }` — mesmas ocasiões e efeitos de R-013/R-015 |
| `body` | `{ operation, conditionId?, partSelector? }` — operações B-037 |
| `social` | `{ perceptTemplate, relationBias }` — fato perceptível + viés A-029 |
| `cognition` | `{ topic, stance }` — mínimo expressável em opinião |
| `community` | `{ lawTemplate, mechanicTarget? }` — proposta de lei ou mecânica |
| `object` | `{ defId, trigger, outcome, effect }` — `ItemRule` no Funcionamento, V-041 |

Regra provisória entra **viva imediatamente**, revisável no painel (R-046/B-045). Se não expressável no vocabulário fechado → forçar `one_off`. Portão: registro de plausibilidade do cenário (B-044).

**Aceite:** invocação com `verdict: systemic` persiste regra provisória no domínio correto; terceira repetição do mesmo par método-efeito aparece como candidato a promoção permanente.

---

## Transversal

### R-047 — Determinismo
`P0` · `V1` · derivado de X-004 · dep: R-014

Toda aleatoriedade do substrato vem de um gerador semeado, em fluxo próprio: acrescentar um dado no substrato não desloca o do Validador.

Duas ordens precisam ser fixas, e nenhuma das duas é a ordem natural da estrutura de dados:

- **O conjunto ativo é percorrido por identificador**, e não pela ordem de inserção. A ordem de inserção é determinística em JavaScript, mas depende da sequência de eventos que ativou cada alvo — o que faz a mesma cena, alcançada por caminhos diferentes, consumir o fluxo em ordem diferente e divergir a partir dali. Ordenar até `substrato.maxTilesAtivosSimultaneos` alvos custa nada.
- **As regras são avaliadas por identificador**, e não pela ordem do arquivo. Duas regras podem casar com o mesmo par, e deixar isso depender de onde alguém colou a regra nova no JSON faria uma edição cosmética mudar toda uma partida gravada.

O dado é puxado mesmo quando a chance é 1. Puxar só quando há incerteza faria o consumo do fluxo depender do estado do mundo, e duas execuções que divergissem por um instante nunca mais se reencontrariam.

**Aceite:** duas execuções com a mesma seed produzem logs de reação idênticos byte a byte, inclusive quando os alvos foram ativados em ordens diferentes.

### R-048 — Log causal
`P1` · `V1` · derivado · dep: R-014

Todo efeito registra o que o causou: qual regra, qual entidade de origem, qual ocasião, ou qual invocação do Validador. O log alimenta a timeline e a depuração.

Sem isso, uma cadeia de seis passos é indistinguível de um bug.

**Efeito que não muda nada não vira linha.** Fogo sobre o que já queima, molhar o que já está encharcado no mesmo grau: a engine devolve "nada mudou" e o log não registra. Registrar não-eventos encheria a janela de retenção de X-017 com ruído e, pior, reativaria o alvo, mantendo no laço uma entidade que já não tem o que dizer.

**Aceite:** dado um tile queimado, é possível reconstruir a cadeia completa até a causa inicial; e invocar `ignite` sobre o que já queima com intensidade menor não produz linha nenhuma.

### R-049 — Orçamento de custo por tick
`P1` · `V3` · derivado de X-008 · dep: R-014, R-005

O substrato inteiro cabe num orçamento fixo de tempo por tick, medido e reportado. Avaliação restrita a entidades com estado ativo. **Campos calculados (R-005) invalidam e recomputam só tiles em escopo** — nunca um grid inteiro por tick, e nunca um grid em que nada mudou.

**Aceite:** com o número de tiles ativos no teto declarado em `tuning.json` (`substrato.maxTilesAtivosSimultaneos`), o tick permanece dentro do orçamento também declarado ali; alterar um emissor de luz não dispara recomputação global de odor/som/luz.

⚑ Este aceite dizia "com cem tiles", número que ficou para trás quando o teto virou 512. Um aceite que testa abaixo do teto que o sistema permite não prova nada sobre o pior caso permitido — e o pior caso é justamente o incêndio, que é quando o orçamento importa. Aceite que cita número de comportamento em prosa contraria `X-008`; aqui ele passa a citar o parâmetro.

### R-050 — Tudo em dado
`P0` · `V1` · decisão · dep: R-001

Materiais, elementos, substâncias, reações, limiares, promoções e propagações vivem em `config/`, validados por schema. Código implementa mecanismo; dado descreve mundo.

**Aceite:** é possível alterar o comportamento de qualquer sistema deste documento sem tocar em arquivo `.ts`.

---

## Eixo Z

O mundo é 2.5D (W-059): há grids empilhados e há altura contínua dentro da célula. O substrato precisa saber o que disso ele atravessa, e o critério é o mesmo que decide tudo neste documento — atravessa o que produz fato sobre o qual vale a pena pensar, e pelo caminho mais barato que produza esse fato.

### R-051 — Propagação entre grids alinhados
`P0` · `V2` · derivado · dep: R-016, W-060

A vizinhança de uma célula ganha, no máximo, dois vizinhos: a célula correspondente no grid imediatamente abaixo e a do imediatamente acima. Um passo por tick e um `zLevel` por passo — uma cadeia que suba três andares sobe em três avaliações sucessivas, e o custo continua proporcional ao número de células ativas, nunca à altura da pilha.

O que atravessa depende do mecanismo, e cada linha reusa o caminho que já existia no plano:

| O que | Atravessa | Por onde |
|---|---|---|
| calor | sempre | condução pelo piso, que é material com calor específico próprio, pelo mesmo caminho de contato de R-008 |
| som | sempre | amortecido pelo piso como por uma parede do mesmo material (R-035) |
| gás e fumaça | só com abertura | difusão de R-023 pela célula aberta |
| líquido | só com abertura | escoa e cai, chegando na célula correspondente de baixo (R-052) |
| luz | só com abertura | o piso é oclusor total; o buraco é emissor secundário (R-034) |
| linha de visão e projétil | só com abertura | oclusão de W-008 |
| eletricidade | quando a cadeia condutiva é contígua | nenhuma regra nova: o piso é material como outro qualquer, e um piso condutivo conduz (R-011) |

Nada atravessa **mais de um grid por passo**, e nada atravessa para grid destacado (R-053). Fogo não tem linha própria na tabela: fogo salta por vizinhança entre inflamáveis, e a abertura torna as duas células vizinhas — se o piso do andar de cima é de madeira, ele acende por calor ao cruzar o próprio ponto de ignição (R-009), sem que exista regra ligando incêndio a andar.

**Aceite:** uma fogueira no andar de baixo aquece o piso do de cima sem abertura nenhuma, e a fumaça dela só sobe onde há buraco; um grito atravessa o piso com a mesma atenuação com que atravessaria uma parede do mesmo material; e abrir um alçapão faz gás, luz e linha de visão passarem a atravessar sem nenhuma regra específica de alçapão.

### R-052 — Escoamento, assentamento e subida por altura
`P0` · `V2` · derivado · dep: R-016, R-020, R-023, W-063

Líquido escorre para a célula vizinha de `baseHeight` **estritamente menor**, e distribui entre as de altura igual; uma célula cuja soma de solo e material de tile seja maior que a do lado retém. É o relevo que decide o destino da poça, não uma regra por caso — óleo derramado num piso inclinado termina acumulado na célula de menor solo do trecho, e é lá que ele pega fogo por inteiro. Havendo abertura no chão, o líquido cai para a célula correspondente do grid de baixo (R-051), que é como um andar alagado goteja no andar de baixo sem sistema de goteira.

Gás pesado — densidade acima da do ar ambiente — **assenta**: prefere a vizinha de `baseHeight` menor e acumula em depressão, porão e vala, que é onde ele se torna perigoso porque é onde alguém desce. Gás leve **sobe**: satura a parte de cima do cômodo e, havendo abertura, passa para o grid acima em passos sucessivos; sem abertura, ele fica, e a densidade da célula cresce até dissipar pelo caminho normal de R-023.

**Aceite:** óleo derramado num piso com relevo se acumula na célula de menor `baseHeight` do trecho; fumaça num porão fechado satura o cômodo em vez de subir; abrir um alçapão faz a mesma fumaça migrar para o grid de cima ao longo de ticks sucessivos; e gás pesado solto num terreno com vala termina na vala.

### R-053 — Grid destacado é ilha do substrato
`P1` · `V3` · derivado · dep: R-051, W-061

Um grid destacado não corresponde a lugar nenhum (W-061), e por isso não tem célula acima nem abaixo para atravessar nada. Nada do substrato cruza a sua fronteira — nem calor, nem som, nem gás, nem líquido, nem luz, nem eletricidade — com uma exceção, que é a **célula de entrada**: ali as duas células, a de dentro e a que a contém, são vizinhas comuns, e tudo que atravessaria entre duas células vizinhas atravessa por ali e só por ali.

O isolamento não é decoração: é o que faz espaço extraespacial ser barato. Um grid destacado inativo nunca entra na varredura de vizinhança de grid nenhum, então declarar dez deles custa memória e zero CPU (X-013). E é também o que faz o espaço destacado significar algo narrativamente — um incêndio dentro de um baú mágico não queima a casa, e um grito lá dentro não é ouvido do lado de fora, o que é justamente o motivo de alguém esconder coisas ali.

**Aceite:** um incêndio dentro de um grid destacado não altera a temperatura de nenhuma célula fora dele, exceto a célula de entrada e as vizinhas dela pelo caminho normal de R-008; um grito lá dentro não é percebido fora; e fechar a entrada isola por completo, inclusive a célula de entrada.

---

## Não-objetivos

Deliberadamente fora de escopo, por decisão e não por esquecimento: hidrodinâmica com pressão, camadas de tecido por parte, química com estequiometria, balística, cálculo estrutural de carga e colapso, e metabolismo nutricional detalhado.

Órgãos individuais estavam nesta lista e **saíram**: eles entraram em escopo em B-053, na forma reduzida de campos a mais numa parte que já existia. O que se recusou foi a camada de tecido — que é o item caro do Dwarf Fortress — e não o órgão, que custa quatro números e paga em possibilidade narrativa.

Dwarf Fortress é advertência tanto quanto inspiração. Profundidade de simulação é poço sem fundo, e este projeto não é sobre física — é sobre gente que percebe, pensa e convive. O substrato existe para dar a essa gente algo verdadeiro sobre o que pensar, e para na hora em que para de fazer isso.
