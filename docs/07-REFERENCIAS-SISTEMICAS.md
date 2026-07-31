# Referências sistêmicas

Pesquisa sobre como jogos com emergência real constroem o substrato sobre o qual tudo o mais acontece, e o que deste projeto se apoia em cada um.

O objetivo desta leitura não foi copiar mecânicas. Foi encontrar os **poucos mecanismos genéricos** que, em cada um desses jogos, geram a maior parte do comportamento interessante — porque é exatamente esse substrato que o GM deste projeto precisa ter debaixo dele para poder improvisar sem inventar física.

---

## 1. O problema que todos eles resolvem

Um mundo interativo tem duas maneiras de existir.

Na primeira, cada interação é escrita à mão: esta tocha acende esta cortina porque alguém escreveu um gatilho ligando as duas. Harvey Smith chama isso de **special case**, e o custo é linear no número de pares — some um objeto novo e é preciso reescrever suas interações com tudo que já existe.

Na segunda, objetos pertencem a classes com propriedades globais, e as regras ligam **classe a classe**. Some um objeto novo com a etiqueta certa e ele herda todo o comportamento de graça. Isso é **systemic**, e é a única forma que escala.

> "Systemic LD involves linking interactions on a class to class basis, where possible. Instead of linking interactions between individual unique game elements on a per instance basis."
> — Harvey Smith, *Systemic Level Design*

Para este projeto a escolha nem é uma escolha. O usuário pode inventar objetos em tempo de execução (W-034) e o GM pode inventar situações. Nenhum dos dois pode depender de alguém ter escrito o par antes.

---

## 2. Breath of the Wild — a regra que impede a explosão combinatória

O achado mais valioso da pesquisa, e o que reorganiza o desenho inteiro.

Takuhiro Dohta descreve o *chemistry engine* como par do physics engine: se o de física decide como as coisas se movem, o de química decide **como as coisas mudam de estado**. Ele roda sobre três regras e só três:

1. Elementos mudam o estado de materiais.
2. Elementos mudam o estado de outros elementos.
3. **Materiais não mudam o estado de outros materiais.**

A distinção: *elemento* é o que não tem estado constante — fogo, água, gelo, eletricidade, vento. *Material* é o que é estável — madeira, pedra, pano, o próprio personagem.

A terceira regra é a importante, e é a que quase todo mundo esquece de enunciar. Sem ela, o número de regras possíveis é o quadrado do número de materiais. Com trinta materiais são novecentos pares a considerar. Com ela, é o número de elementos vezes tudo o mais — com oito elementos e trinta materiais, duzentas e poucas combinações, das quais se escreve umas quarenta porque as etiquetas agrupam.

Não é a proibição de que dois objetos interajam. Madeira ainda quebra pedra na pancada. É a proibição de que dois **materiais reajam quimicamente** entre si sem um elemento no meio. Impacto, peso e atrito continuam existindo — são física, resolvida por escalares, não pela matriz.

**Adotamos:** a regra dos três, literalmente, como restrição de desenho da matriz de reação.
**Rejeitamos:** nada. É o alicerce.

---

## 3. Dwarf Fortress — um escalar contínuo no lugar de dezenas de regras

DF poderia ter uma regra "fogo mais gelo vira água". Não tem. Tem **temperatura**, um número por item, e cada material declara os limiares onde algo acontece com ele:

| Token | O que é |
|-------|---------|
| `MELTING_POINT` | onde sólido vira líquido e líquido congela |
| `BOILING_POINT` | onde líquido vira gás |
| `IGNITE_POINT` | onde pega fogo |
| `HEATDAM_POINT` / `COLDDAM_POINT` | onde começa a sofrer dano |
| `SPEC_HEAT` | quanto resiste a mudar de temperatura |

A propagação é uma linha de aritmética: a cada tick, o item move sua temperatura em direção à do ambiente pela diferença dividida pelo calor específico. Um pedaço de linhito com `SPEC_HEAT 409` jogado em magma a 12000 °U sobe 4,85 °U no primeiro tick, depois cada vez mais devagar, e leva 517 ticks para chegar ao seu ponto de ignição.

O resultado é que derreter, congelar, ferver, incendiar, queimar e congelar-se **não são regras**. São o mesmo número cruzando limiares diferentes. Caves of Qud faz igual com quatro limiares e uma convergência assintótica ao ambiente.

Isso muda a heurística de desenho: **antes de escrever uma regra, pergunte se ela não é um limiar sobre um escalar que já existe.** É a diferença entre uma tabela de quarenta reações e uma tabela de quatrocentas.

**Adotamos:** temperatura como escalar unificador com limiares por material; a fórmula de convergência com resistência por material.
**Rejeitamos:** a escala Urist e a precisão física. Nossos números são de jogo, calibráveis em `config/`.

### 3.1 Síndromes — um payload genérico com quatro vetores de entrada

O segundo grande genérico do DF. Uma *síndrome* é um pacote arbitrário de efeitos sobre um corpo, e o que a define não é o que ela faz, e sim **por onde entra**:

| Vetor | Como |
|-------|------|
| `SYN_CONTACT` | a substância suja a pele — respingo, poça pisada descalço, chuva, contato com quem está contaminado, ser golpeado por item sujo |
| `SYN_INHALED` | a substância está em estado gasoso e foi respirada |
| `SYN_INGESTED` | foi comida ou bebida, **inclusive como ingrediente de um prato preparado** |
| `SYN_INJECTED` | entrou na corrente sanguínea por ferida ou arma envenenada |

Um mecanismo, e dele saem veneno, peçonha, álcool, remédio, droga, alergia, doença, fumaça inalada, queimadura química. Repare em "inclusive como ingrediente de um prato preparado": a substância viaja pela cadeia de produção sozinha. Ninguém escreveu "torta envenenada".

Para um simulador **social**, isso é desproporcionalmente valioso: bebida, comida estragada, remédio, contágio e envenenamento deliberado são o mesmo sistema, e todos produzem estado interno que o agente sente e sobre o qual pensa.

**Adotamos:** o payload genérico e os quatro vetores, com uma extensão — o payload pode alterar **cognição**, não só fisiologia.
**Rejeitamos:** a modelagem por camada de tecido. O órgão, este sim adotamos, mas numa forma que o DF não reconheceria: quatro números a mais numa parte que já existia — vascularização, idade biológica, acúmulo tóxico e classe — desaguando num funcionamento derivado só (B-053 a B-055). O que se recusou foi a camada, que é onde o custo do DF mora.

### 3.2 Contaminantes — a ponte entre física e vida social

Em DF, qualquer material pode **cobrir** qualquer superfície ou parte de corpo, e a cobertura persiste e é visível no inventário da criatura como "mancha", "poeira" ou "camada" de tal coisa.

É um detalhe de simulação que vira, sem que ninguém tenha planejado, um sistema narrativo: sangue nas mãos é um fato do mundo, observável por terceiros.

Neste projeto isso deixa de ser acidente e vira propósito. **A cobertura é o principal canal pelo qual o substrato físico entra na cognição social.** Um agente que vê sangue nas mãos de outro forma uma impressão, a impressão vira opinião, a opinião muda objetivo. Todo o aparato de física existe, em última análise, para produzir fatos assim.

Noita e Caves of Qud têm o mesmo conceito em forma reduzida: cada material declara `stainEffect`, `submergeEffect` e `ingestEffect`.

**Adotamos:** coberturas persistentes e perceptíveis, em tiles, objetos e corpos, ligadas explicitamente à percepção.

---

## 4. Brogue — camadas por célula e promoção

Brogue guarda **quatro camadas de terreno por célula**, não uma: `DUNGEON` (parede, chão, armadilha), `LIQUID` (água, lava, abismo), `GAS` (fogo, fumaça, gás venenoso) e `SURFACE` (grama, teia, sangue). Uma célula pode ser chão, com água rasa, com grama, sob uma nuvem de fumaça, ao mesmo tempo.

E cada tipo de tile do catálogo é uma linha de tabela com estas colunas, entre outras:

| Campo | O que faz |
|-------|-----------|
| `chanceToIgnite` | chance de pegar fogo se houver chama num vizinho cardinal |
| `fireType` | no que se transforma quando acende |
| `promoteType` | no que se transforma quando promove por outro motivo |
| `promoteChance` | chance por turno de promover, em centésimos de porcento |
| `flags` / `mechFlags` | `T_IS_FLAMMABLE`, `TM_PROMOTES_ON_STEP`, `TM_VANISHES_UPON_PROMOTION`, e dezenas de outras |

**Promoção** é o genérico aqui: um tile declara em que ele vira e com que probabilidade por turno, mais gatilhos como "ao ser pisado" ou "ao entrar". Isso sozinho cobre crescimento de vegetação, apodrecimento, fogo que queima e vira cinza, poça que evapora, líquen que se espalha, armadilha que dispara.

É notavelmente barato. Não é um sistema — é uma coluna a mais na tabela de tiles.

**Adotamos:** camadas por célula e promoção com probabilidade e gatilho.
**Rejeitamos:** o sistema de *machines* — vaults e puzzles pré-fabricados são conteúdo autoral, o oposto do que este projeto quer.

---

## 5. Noita — a reação como regra de reescrita pura

Toda a química de Noita vive num XML. Uma reação é isto:

```xml
<Reaction probability="1"
  input_cell1="fire" input_cell2="[flammable]"
  output_cell1="fire" output_cell2="fire" />
```

Entradas, saídas, probabilidade. A probabilidade **é** a taxa — não existe um sistema de velocidade separado. E `[flammable]` entre colchetes é uma etiqueta, não um material: a regra vale para a classe inteira. É a proposta de Harvey Smith em forma de dado.

O catálogo de materiais é igualmente plano — densidade, dureza, durabilidade, condutivo, inflamável, escorregadio, tempo de vida, derrete em, congela em, quebra em, efeito ao manchar, efeito ao submergir, efeito ao ingerir, etiquetas.

**Adotamos:** a forma da regra — entrada mais entrada resultando em saída mais saída, com probabilidade como taxa e etiquetas no lugar de identificadores.
**Rejeitamos:** o autômato celular por pixel. Nosso grão é o tile, e nosso orçamento de CPU pertence aos LLMs.

---

## 6. Caves of Qud — líquidos como volume e mistura

Qud mede líquido em **drams** e permite mistura. Uma poça não é "água", é uma composição, e cada componente evapora no seu ritmo — o que faz poças mistas convergirem para o componente menos volátil ao longo do tempo.

Cada líquido declara temperatura base, de congelamento, de chama e de vaporização, mais fluidez, evaporatividade, poder de limpeza, e o objeto em que vaporiza. Água vira vapor escaldante a 100°, e o vapor causa dano proporcional à densidade.

O detalhe elegante: **lava não tem regra própria**. Ela destrói recipientes porque sua temperatura base é 1000° e o recipiente esquenta até se destruir sozinho. Consequência, não regra.

**Adotamos:** volume e mistura para líquidos, evaporação por componente, e a disciplina de derivar comportamento de propriedades em vez de casos especiais.
**Rejeitamos:** pressão e hidrodinâmica de verdade.

---

## 7. RimWorld — o mesmo motor aplicado ao corpo

Se DF é advertência sobre profundidade, RimWorld é a demonstração de que dá para ter saúde profunda e barata ao mesmo tempo. Ele roda vinte e tantos personagens com anatomia, doenças e cirurgia em hardware modesto, e consegue isso com três decisões.

**Uma unidade só, chamada hediff.** *Health difference* é literalmente tudo: ferimento, doença, infecção, cicatriz, prótese, vício, efeito de droga, gravidez, condição crônica de idade. Um tipo, um laço de atualização, uma tela, um caminho de serialização. Adicionar tuberculose custa o mesmo que adicionar ressaca — uma entrada em XML.

Cada hediff tem severidade e **estágios** que ativam em limiares, e cada estágio traz seus próprios modificadores. É o que produz não-linearidade — o incômodo que vira ameaça de vida ao cruzar um número — ao preço de uma comparação.

**Capacidades derivadas, nunca atribuídas.** O personagem não tem "saúde". Tem consciência, visão, audição, movimento, manipulação, fala, respiração, bombeamento sanguíneo, filtragem sanguínea, digestão e metabolismo — cada uma calculada da eficiência das partes que a servem mais os offsets dos hediffs ativos.

Consciência é o nó que amarra tudo: depende de cérebro, bombeamento, respiração, filtragem e dor, e **multiplica** movimento, manipulação e fala. Daí sai a interdependência mais bonita do sistema: um pulmão perfurado piora a firmeza da mão. Ninguém escreveu uma regra ligando pulmão a mão — ela passa pela consciência.

**A corrida da infecção.** Severidade e imunidade partem de zero e a primeira a chegar a 100% vence. Sem tratamento a severidade sobe a +0,84 por dia e a imunidade a +0,644 — o paciente perde, e morre em pouco mais de um dia. Tratamento **não** acelera a imunidade; desacelera a severidade, em até −0,53 por dia com qualidade máxima. Quem acelera a imunidade é descanso, nutrição e filtragem sanguínea saudável.

A assimetria é o desenho inteiro. Remédio sozinho não salva e repouso sozinho não salva: é preciso alguém tratando **e** o doente aceitando ficar deitado. Num simulador social, isso é uma máquina de drama que não custa nada — quem cuida, quem se recusa a descansar, quem foi deixado.

**Adotamos:** a árvore de partes com cobertura e vitalidade, o hediff como unidade única com estágios, as capacidades derivadas com consciência multiplicadora, e a corrida assimétrica da infecção.
**Rejeitamos:** camadas de tecido por parte, cirurgia com procedimentos individuais, e farmacocinética.

Detalhamento em [SPEC-B-corpo.md](spec/SPEC-B-corpo.md). O ponto que interessa aqui é que **é o mesmo motor do substrato de tiles com outra topologia** — árvore de vinte e oito nós em vez de grid. Parte é tile, hediff é estado transiente, capacidade é campo calculado, matriz de lesão é matriz de reação, cascata pela árvore é propagação por vizinhança. Nada precisou ser inventado duas vezes.

**Onde fomos além do RimWorld:** lá, tecidos são uma tabela própria, separada dos materiais de construção. Aqui é um catálogo só (B-003) — pele e músculo ficam ao lado de carvalho e ferro, com as mesmas propriedades e etiquetas. Duas coisas caem no colo por causa disso.

A primeira é que a matriz de lesão passa a ser escrita em propriedade, não em nome de tecido: `contusão + #frágil → fratura` cobre osso, vidro e cerâmica com a mesma linha.

A segunda é que **transmutar o material de uma parte do corpo vira operação trivial** (B-038), e todas as consequências emergem sozinhas. Um osso transmutado em vidro para de cicatrizar porque perdeu a etiqueta `living`, e quebra com quase nada porque a resistência a impacto do vidro é zero. Ninguém escreveu regra para ossos de vidro. É a promessa de etiqueta-em-vez-de-identificador da BOTW cobrada no lugar onde ela dá o retorno mais alto.

E fomos além em dois pontos que não vêm do catálogo único. A parte do corpo ganhou vascularização, idade biológica e carga tóxica próprias (B-053), o que faz dois órgãos do mesmo tecido se comportarem diferente sem que exista tabela de órgãos. E a corrida assimétrica da infecção foi **reusada** para a intoxicação (B-060) em vez de ganhar um segundo mecanismo com a mesma forma — um mecanismo calibrado uma vez, cobrando duas.

---

## 8. Cataclysm: DDA — o formato do estado transiente

CDDA guarda, por tile, um conjunto de **campos**, cada um com tipo, intensidade e idade, todos coexistindo e decaindo. Móveis podem ter a etiqueta `EMITTER` e emitir campos continuamente a partir de uma definição em dado.

Confirma o formato que já tínhamos: estado transiente é `(tipo, intensidade, duração)`, vários por tile.

---

## 9. O que estas leituras mudam no projeto

| Princípio | Origem | Consequência aqui |
|-----------|--------|-------------------|
| Elemento muda material, elemento muda elemento, material não muda material | BOTW | restringe a matriz e impede explosão combinatória |
| Escalar contínuo com limiares por material antes de regra discreta | DF, Qud | temperatura substitui dezenas de reações |
| Resistência à mudança é propriedade do material | DF | calor específico, absorvência, condutividade |
| Payload genérico com vetores de entrada | DF | veneno, bebida, remédio e doença viram um sistema só |
| Cobertura persistente e visível | DF, Noita, Qud | é a ponte do físico para o social |
| Camadas por célula | Brogue | chão, líquido, superfície e gás simultâneos |
| Promoção com probabilidade e gatilho | Brogue | crescimento, apodrecimento e extinção sem sistema novo |
| Reação como reescrita com probabilidade e etiqueta | Noita | matriz em dado, editável sem recompilar |
| Volume e mistura | Qud | poças que diluem e evaporam por componente |
| Classe a classe, nunca instância a instância | Harvey Smith | objeto novo do usuário herda tudo pela etiqueta |
| Consistência acima de conteúdo | immersive sims | nenhuma exceção escrita à mão para caso famoso |
| Uma unidade só para toda condição de saúde | RimWorld | ferida, doença, prótese e bebedeira são o mesmo tipo |
| Capacidade derivada, com consciência multiplicando | RimWorld | interdependência sem regra escrita para o par |
| Corrida assimétrica entre doença e imunidade | RimWorld | remédio sozinho não salva; alguém precisa cuidar e o doente precisa aceitar |
| Só o que tem estado ativo é avaliado | DF, CDDA, RimWorld | tile íntegro e agente saudável custam zero |

---

## 10. A diferença deste projeto

Em todos esses jogos o substrato existe para o **jogador** explorar. Aqui existe para duas coisas a mais.

**Para o agente perceber e pensar sobre.** Fumaça não bloqueia só a linha de visão — bloqueia a testemunha. Sangue não é só uma mancha — é uma evidência que produz impressão, opinião e objetivo. O substrato só se justifica se seus produtos chegarem à cognição.

**Para o GM ter vocabulário.** O GM não simula física; ele decide se um efeito começa, e só quando nenhuma regra já responderia isso. Quanto mais completo o substrato, menos ele é chamado — e cada chamada evitada é uma chamada de LLM economizada e um comportamento a mais que virou determinístico e testável.

Disso sai a regra operacional que fecha o ciclo: **invocação recorrente do GM é dívida de matriz.** Se o GM inventa a mesma coisa três vezes, aquilo deveria ser uma linha em `config/reactions.json`.

E há uma diferença de economia que muda o que vale a pena simular. Nesses jogos o recurso escasso é CPU. Aqui não é: uma chamada de modelo custa entre centenas de milissegundos e alguns segundos, e o substrato inteiro de vinte agentes custa frações de milissegundo. O que é escasso aqui é **token de contexto**.

Isso libera e restringe ao mesmo tempo. Libera, porque a simulação pode ser bem mais rica do que o orçamento de CPU sugeriria. Restringe, porque nada disso pode ser despejado cru no prompt. A disciplina que sai daí: **rico na simulação, resumido em prosa no contexto.** O agente não recebe uma tabela de vinte e cinco partes do corpo; recebe "seu braço esquerdo está quebrado e dói muito".

---

## 11. Orçamento de complexidade

DF é advertência tanto quanto inspiração. Profundidade de simulação é um poço sem fundo, e este projeto não é sobre física.

Fora de escopo, por decisão e não por esquecimento: hidrodinâmica com pressão, camadas de tecido por parte, química real com estequiometria, balística, estrutura com cálculo de carga e propagação de colapso, metabolismo nutricional detalhado, e dose de radiação com meia-vida e blindagem.

Órgãos individuais saíram desta lista quando entraram em SPEC-B (B-053). A revisão vale a pena registrar porque mostra onde o critério de admissão morde: o órgão passou não por ser mais realista, e sim porque produz três fatos que a parte genérica não produzia — dois órgãos do mesmo tecido sangram diferente, envelhecem diferente e adoecem em ritmos diferentes — e porque cabe em quatro números que ninguém avalia por tick.

O critério para admitir um sistema novo no substrato é um só: **ele produz fato que um agente pode perceber e sobre o qual vale a pena pensar?** Fumaça passa, porque esconde. Sangue passa, porque acusa. Fome passa, porque move. Estequiometria não passa.

---

## Fontes

- Dohta, Takuhiro; Fujibayashi, Hidemaro; Takizawa, Satoru. [*Breaking Conventions with The Legend of Zelda: Breath of the Wild*](https://www.youtube.com/watch?v=QyMsF31NdNc), GDC 2017
- Smith, Harvey. [*Systemic Level Design*](https://www.scribd.com/document/398558887/Systemic-Level-Design-Harvey-Smith)
- [Dwarf Fortress Wiki — Temperature](https://dwarffortresswiki.org/index.php/Temperature)
- [Dwarf Fortress Wiki — Material definition token](https://www.dwarffortresswiki.org/index.php/Material_definition_token)
- [Dwarf Fortress Wiki — Syndrome](https://www.dwarffortresswiki.org/index.php/Syndrome)
- [Brogue CE — `Rogue.h`, camadas e `floorTileType`](https://github.com/tmewett/BrogueCE/blob/master/src/brogue/Rogue.h)
- [Brogue CE — `Globals.c`, catálogo de tiles](https://github.com/tmewett/BrogueCE/blob/master/src/brogue/Globals.c)
- [Noita Wiki — Documentation: Reaction](https://noita.wiki.gg/wiki/Documentation:_Reaction)
- [Noita Wiki — Material Information Table](https://noita.wiki.gg/wiki/Material_Information_Table)
- [RimWorld Wiki — Hediffs](https://www.rimworldwiki.com/wiki/Hediffs)
- [RimWorld Wiki — Capacity](https://rimworldwiki.com/wiki/Capacity)
- [RimWorld Wiki — Health](https://rimworldwiki.com/wiki/Health)
- [RimWorld Wiki — Infection](https://rimworldwiki.com/wiki/Infection)
- [Caves of Qud Wiki — Liquid](https://wiki.cavesofqud.com/wiki/Liquid)
- [Caves of Qud Wiki — Temperature](https://wiki.cavesofqud.com/wiki/Temperature)
- [Cataclysm: DDA — `src/field.h`](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/field.h)
