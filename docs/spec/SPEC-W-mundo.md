# SPEC-W — Mundo

Grid, tiles, materiais, objetos, geração, tempo e espaço.

Nada aqui consulta LLM em runtime, exceto a geração de pré-jogo.

O mundo é **2.5D**: um plano bidimensional com altura contínua dentro de cada célula, mais grids empilhados. A escala do tile, as regras de empilhamento, a altura, a ocupação e o armazenamento de célula estão na seção **Mundo 2.5D**, no fim deste documento.

O substrato reativo que roda **sobre** esta geografia — reações, temperatura, líquidos, gases, coberturas, percepção — está em [SPEC-R-substrato.md](SPEC-R-substrato.md).

---

## Grid e espaço

### W-001 — Grid discreto de tiles
`P0` · `V1` · PDF 2 · dep: —

Matriz de tiles indexada por coordenadas inteiras. Entre 32×32 e 512×512, onde cada célula mede 0,5 m de lado (W-057) e o teto se justifica em W-058.

Um mundo tem mais de uma dessas matrizes quando há andar, porão ou espaço destacado (W-059); a coordenada inteira só identifica uma célula sem ambiguidade acompanhada do grid a que pertence.

**Aceite:** qualquer célula é endereçável pelo par grid e `(x, y)`.

### W-002 — Posição contínua sobre o grid
`P0` · `V1` · PDF 6 · dep: W-001

Agentes e objetos têm posição em ponto flutuante. O grid governa tiles, colisão e affordances; não governa onde uma entidade para. Rotação livre em graus.

**Aceite:** um agente para em `(12.37, 8.91)` com rotação `137.5°`, sem alinhamento forçado.

### W-003 — Tipos de tile
`P0` · `V1` · PDF 108-113 · dep: W-001

Sete tipos: `floor`, `wall`, `door`, `window`, `roof`, `water`, `road`. Cada tipo declara padrões de bloqueio de movimento e visão.

**Aceite:** parede bloqueia movimento e visão, janela bloqueia só movimento, chão não bloqueia nada.

### W-004 — Estado mutável de tile
`P0` · `V1` · PDF 112-113 · dep: W-003

Estado estrutural: aberto, trancado. Distinto dos estados transientes de R-004, que vivem em campo separado.

**Aceite:** uma porta alterna aberta e fechada e o pathfinding responde na travessia seguinte.

### W-005 — Propriedades herdadas de material
`P0` · `V1` · PDF 111-112 · dep: W-011

Todo tile e objeto herda as propriedades do material. Sem duplicação na instância.

**Aceite:** trocar madeira por pedra remove `inflammable` sem tocar no tile.

### W-006 — Propriedades adicionais por tipo
`P1` · `V1` · PDF 112-113 · dep: W-003

Comportamentos do tipo, não do material. Abrir e fechar é de porta, independente do material.

**Aceite:** porta de qualquer material abre; parede de qualquer material não.

### W-007 — Camadas de tile
`P1` · `V1` · derivado · dep: W-001

Uma célula suporta chão, estrutura e teto simultaneamente.

Camada é subdivisão **dentro** de uma célula e não se confunde com grid empilhado (W-060). O teto de uma célula é a camada superior dela quando não há nada acima; havendo grid acima, o que faz cobertura é o chão daquele grid, e a abertura que permite queda, luz e fumaça atravessarem é declarada ali (W-060).

**Aceite:** chão de madeira com teto de palha e sem parede coexistem, cada camada editável em separado; e remover o teto de uma célula não altera nenhum grid empilhado sobre ela.

### W-008 — Oclusão de visão
`P1` · `V1` · derivado de PDF 39-40 · dep: W-003, A-007

Linha de visão interrompida por tiles bloqueantes. Telhado de ambiente fechado é ocultado quando a câmera precisa mostrar o interior.

**Aceite:** agente atrás de parede não é percebido; atrás de janela é.

### W-009 — Setores nomeados
`P1` · `V1` · derivado de PDF 262-263 · dep: W-001

Subdivisões identificadas. Cada `ActivityLogEntry` registra o setor de sua ação.

**Aceite:** dois agentes no mesmo setor no mesmo intervalo são recuperáveis por consulta — base da corroboração de relatos.

### W-010 — Rótulos diegéticos de local
`P1` · `V2` · derivado de PDF 450 · dep: W-009

Regiões com nome legível usado em fala e realocação de conversa.

**Aceite:** "Casa de Val" resolve para coordenadas e a resolução inversa funciona.

---

## Materiais

### W-011 — Catálogo de materiais
`P0` · `V1` · PDF 114-120 · dep: —

Carregado de dados, não hardcoded. Inicial: carvalho, pinho, pedra, ferro, cobre, vidro, pano, couro, cerâmica, barro, água, óleo, grama, terra, concreto, gelo, palha, osso, matéria orgânica.

⚑ **pano**, e não "tecido": o material de roupa e cortina se chama `pano`, para não colidir com tecido biológico, que aqui não é uma categoria e sim a etiqueta `tissue` sobre um material qualquer.

Cada entrada é classificada como **material** ou **elemento** conforme R-002 — água e gelo são elementos, carvalho e pedra são materiais — porque a matriz de reação depende dessa distinção para não explodir combinatoriamente.

Este catálogo é **um só para todo o simulador**. Os tecidos do corpo — pele, músculo, órgão, nervo, gordura — são entradas dele, no mesmo formato (B-003). `osso` já estava na lista acima antes de existir sistema de corpo, e continua sendo uma entrada única que serve tanto para um porrete quanto para um fêmur. É essa unificação que permite ao Validador transmutar o material de uma parte do corpo sem código novo (B-038).

Exemplo completo em [`config/materials.example.json`](../../config/materials.example.json).

**Aceite:** adicionar material é editar arquivo de dados, sem tocar em código; toda entrada declara sua categoria; e não existe segundo catálogo em lugar nenhum do projeto.

### W-012 — Propriedades booleanas como etiquetas
`P0` · `V1` · PDF 116-118 refinado por decisão · dep: W-011, R-001

Dezoito propriedades estáticas: inflamável, sensível à água, condutivo, cortante, tóxico, comestível, potável, frágil, flutuante, isolante, transparente, magnético, orgânico, escorregadio, absorvente, corrosivo, luminoso, à prova de som.

Cada uma é uma **etiqueta** no sentido de R-001 (`tags[]` + aliases em `properties` para compatibilidade de dados legados). Regras do substrato referenciam `#inflammable`, `#conductive`, etc. — nunca identificador de material.

⚑ Migração: novos materiais declaram só em `tags[]`; `properties` booleanas permanecem no schema como espelho derivado na carga.

**Aceite:** adicionar `"tags": ["inflammable"]` a um material novo faz ele participar de ignição sem tocar em código; nenhuma regra nomeia material por identificador.

### W-013 — Propriedades numéricas
`P1` · `V1` · PDF 115 refinado por decisão · dep: W-011, R-009

Dureza, densidade, taxa de degradação, velocidade de combustão, valor nutricional, toxicidade, e resistência por tipo de dano.

Mais os **limiares térmicos** de R-009 e o calor específico de R-008, que substituem o que antes era um único campo de "resistência térmica": ponto de fragilização, congelamento, fusão, ebulição, ignição, dano por calor e dano por frio, todos opcionais.

**Aceite:** dureza afeta arrombamento; velocidade de combustão afeta a taxa de propagação de fogo; e um material sem ponto de ignição declarado nunca acende por temperatura.

### W-014 — Descrição textual para o Validador
`P1` · `V4` · PDF 119-120 · dep: W-011, R-041

Materiais complexos carregam descrição em prosa, injetada no contexto do Validador.

**Aceite:** ao mediar ação sobre mármore antigo, o prompt do Validador contém a descrição.

---

## Substrato reativo

Migrado para [SPEC-R-substrato.md](SPEC-R-substrato.md).

O que era `W-015` a `W-028` cresceu muito além de tiles e materiais — temperatura, líquidos, gases, coberturas, substâncias no corpo, campos de luz, som e odor — e ganhou documento próprio. Os requisitos correspondentes agora são `R-001` a `R-050`.

A faixa `W-015` a `W-028` fica **aposentada** e não deve ser reutilizada.

---

## Objetos e itens

### W-029 — Definição de objeto
`P0` · `V2` · PDF 102-104 · dep: W-011

Molde reutilizável conforme `ObjectDef`. Nome, descrição, categoria, material, tamanho, affordances, propriedades customizadas.

**Aceite:** catálogo carregado de dados e listado no menu de construção.

### W-030 — Instância de objeto
`P0` · `V2` · derivado · dep: W-029

Instâncias com posição, rotação, integridade e estados transientes próprios.

**Aceite:** duas cadeiras da mesma definição têm integridade e estado distintos.

### W-031 — Affordances declaradas
`P1` · `V4` · derivado de PDF 103-104 · dep: W-029, C-008

Cada objeto declara as ações que suporta. Alimenta as opções apresentadas ao agente.

**Affordance-first (determinístico):** se a intenção do agente mapeia a uma affordance declarada, a **engine executa sem LLM de Validador**. O Validador só entra quando não há affordance que cubra a ação.

**Aceite:** sentar numa cadeira com affordance `sentar` resolve na engine; contexto do agente inclui affordances disponíveis.

### W-032 — Containers
`P1` · `V2` · derivado · dep: W-030

Objetos contêm outros. A capacidade é volume, não contagem, e o detalhamento vive em O-003.

Item guardado não desaparece do mundo: ele **deixa de ser físico** (O-009) — não colide, não ocupa volume da célula, não é alvo de arremesso, e continua existindo com todo o seu estado, desenhado quando o recipiente é aberto.

**Aceite:** item guardado num baú deixa de colidir e de ser alvo, continua aparecendo na inspeção do baú, e volta a ser físico ao ser retirado.

### W-033 — Durabilidade de objeto
`P2` · `V4` · derivado · dep: R-027, R-028

Uso repetido degrada. Ferramenta quebrada perde affordances.

**Aceite:** martelo com integridade zero deixa de oferecer `reparar`.

### W-034 — Item customizado pelo usuário
`P1` · `V2` · PDF 105-107 · dep: W-029 · prompt: `generation.custom_item`

Criação no modo construção. Formulário manual como base, geração por LLM como conveniência. Persiste no catálogo e no save.

**Aceite:** item criado aparece no menu, é colocável e sobrevive a recarregar.

---

## Geração

### W-035 — Entrada de pré-jogo
`P0` · `V3` · PDF 3-5 · dep: —

Número de agentes e descrição livre opcional. Parâmetros avançados recolhidos.

**Aceite:** iniciar só com o número funciona.

### W-036 — Parâmetros de terreno explícitos
`P0` · `V3` · PDF 9-13 · dep: —

Conjunto nomeado e documentado conforme `terrain_params_response`, claro o bastante para uma LLM ajustar com intenção.

**Aceite:** alterar `waterRatio` de 0.1 para 0.6 produz visivelmente mais água com a mesma seed.

### W-037 — Geração determinística por seed
`P0` · `V3` · derivado · dep: W-036

Mesma seed e parâmetros produzem terreno idêntico.

**Aceite:** duas gerações com seed igual são idênticas.

### W-038 — Geração de terreno multi-tipo
`P0` · `V3` · PDF 9-13 · dep: W-036

Relevo como `baseHeight` contínuo (W-063), biomas, água em quatro estilos, vegetação, estradas.

**Aceite:** os quatro estilos de água produzem topologias reconhecivelmente distintas.

### W-039 — Tradução de descrição em parâmetros
`P1` · `V3` · PDF 9-13 · dep: W-036 · prompt: `generation.scenario_to_terrain`

Descrição livre vira parâmetros mais narrativa de cenário mais leis invioláveis.

**Aceite:** "vila costeira com pouca água potável" produz `waterStyle: costa` com `waterRatio` alto e registra a escassez.

### W-040 — Ferramentas do construtor agentico
`P1` · `V3` · PDF 14-18 · dep: W-038 · prompt: `generation.world_builder`

Ler região, consultar estatísticas, colocar blueprint, pintar tile, colocar objeto, conectar estrada, validar, listar blueprints, finalizar zona.

**Aceite:** cada ferramenta funciona isolada e devolve erro estruturado em uso inválido.

### W-041 — Loop agentico de construção
`P1` · `V3` · PDF 14-18 · dep: W-040

Planejamento de zonas e execução iterativa. Teto de 30 iterações, até 3 replanejamentos por zona.

**Aceite:** uma cidade é construída por tool calls e o loop termina por conclusão, não por estouro.

### W-042 — Catálogo de blueprints
`P1` · `V3` · derivado de PDF 15 · dep: W-029

Casa pequena, média, grande, loja, oficina, celeiro, poço.

**Aceite:** um blueprint posicionado produz estrutura coerente e habitável.

### W-043 — Locais obrigatórios
`P1` · `V3` · PDF 121-123 · dep: W-041

Obrigatórios: moradia suficiente, ponto central, fonte de água potável, local de trabalho, armazém, caminhos conectando tudo.
Recomendados: taberna, enfermaria, local de encontro, cemitério, área de lazer.

**Aceite:** validação falha e força replanejamento se faltar obrigatório.

### W-044 — Validação de mapa
`P0` · `V3` · derivado · dep: W-043

Conectividade por busca em largura, presença de obrigatórios, spawn suficiente.

A conectividade abrange **todos** os grids, não só o principal: um grid alinhado sem escada, rampa ou abertura que o ligue ao resto e um grid destacado sem entrada declarada são regiões isoladas e reprovam pelo mesmo caminho de uma casa sem porta (W-061).

**Aceite:** mapa com casa inalcançável é rejeitado apontando a região isolada; mapa com grid inalcançável é rejeitado nomeando o grid.

### W-045 — Fallback sem LLM
`P1` · `V3` · derivado · dep: W-038

Falha de API ou budget estourado gera mundo só proceduralmente, com blueprints.

**Aceite:** com a rede desligada, a geração completa e produz mapa jogável.

### W-046 — Regeneração parcial
`P2` · `V3` · derivado · dep: W-037

Regerar só terreno ou só construções.

**Aceite:** regerar construções mantém o terreno idêntico.

### W-047 — Pontos de spawn
`P0` · `V3` · derivado · dep: W-043

Posições iniciais coerentes com a preferência de cada perfil.

**Aceite:** todos nascem em tile caminhável e alcançável.

---

## Pathfinding

### W-048 — Busca de caminho
`P0` · `V1` · PDF 497-498 · dep: W-003

A* sobre o grid, respeitando bloqueio e estado de tile.

Havendo mais de um grid (W-059), a busca corre sobre o conjunto e não sobre um só: a fronteira entre grids alinhados é atravessável onde existe escada, rampa ou abertura declarada, e um grid destacado é alcançável apenas pela sua célula de entrada (W-061). Cada travessia entra na busca como uma aresta com custo próprio, e não como caso especial de código.

**Aceite:** o agente contorna parede; fechar porta no caminho força recálculo; e um caminho de um andar para outro atravessa exatamente a célula de escada, aparecendo no plano como travessia de grid.

### W-049 — Custo por tile
`P1` · `V1` · derivado · dep: W-048

Estrada acelera; água, escombro e tile em chamas encarecem. Agente evita fogo por custo, não por regra especial.

**Aceite:** entre dois caminhos iguais, o de estrada vence; um caminho em chamas só é escolhido se for o único.

### W-050 — Trajetória em vez de posição
`P0` · `V1` · decisão (05-PROTOCOLO §4.2) · dep: W-048

O núcleo transmite caminho, velocidade e chegada estimada. O cliente interpola.

**Aceite:** movimento suave no cliente com atualização a 15 Hz.

---

## Tempo

### W-051 — Relógio de simulação
`P0` · `V1` · derivado · dep: —

Um tick é um minuto simulado. Todo evento datado em `simTime`.

**Aceite:** 1440 ticks incrementam o dia em um.

### W-052 — Controle de velocidade
`P0` · `V1` · PDF 24 · dep: W-051

Pausado, 1×, 2×, 4×, 8×. Em 8× o tier `longform` é desabilitado.

**Aceite:** troca imediata; pausa congela todo avanço de estado, inclusive o sistema reativo.

### W-053 — Calendário
`P1` · `V1` · PDF 244-250 · dep: W-051

Dia, estação de 15 dias, ano de 4 estações. Escala configurável.

**Aceite:** gatilhos sazonal e anual disparam nos limites corretos.

### W-054 — Ciclo dia e noite
`P1` · `V1` · derivado de PDF 242 · dep: W-051

Governa sono, iluminação e visibilidade.

Não governa a cadência da memória. O lote noturno roda na fronteira de dia **global**, por `C-031`, e não no instante em que cada um adormece: com rotinas distintas por `A-027`, um agente deita às 22h e outro às 3h, e amarrar a condensação ao evento de sono faria a mesma noite ser condensada em momentos diferentes para cada pessoa — com risco de resumo duplo, de resumo antes de o dia daquele agente ter acabado, e de marcantes eleitos num instante e condensados noutro.

**Aceite:** agentes dormem no horário da rotina e a iluminação e o alcance de visão mudam com a hora; nenhum resumo de memória é disparado pelo evento de dormir.

### W-055 — Clima
`P2` · `V4` · PDF 489-491 · dep: W-053, R-040

Estado climático que entra no contexto contemplativo e alimenta o substrato — chuva molha e apaga, vento modula propagação, frio congela, calor seca.

**Aceite:** chuva apaga incêndio ativo por meio de `extinguish`, sem regra especial de clima.

### W-056 — Agendador de eventos
`P0` · `V1` · derivado · dep: W-051

Fila temporizada para sumarizações, pensamentos espontâneos, decaimento de necessidades, degradação e reuniões.

**Aceite:** evento agendado dispara no tick previsto, inclusive após salvar e recarregar.

---

## Mundo 2.5D

O plano continua bidimensional. A terceira dimensão entra por dois caminhos que não competem: **altura contínua** dentro de cada célula, que resolve relevo, mureta, degrau e queda curta; e **grids empilhados**, que resolvem andar, porão, caverna e espaço destacado. Não há voxel, não há malha 3D, e o render permanece top-down.

A razão de fazer isto agora é narrativa, não visual: um mundo de um só plano sem escala declarada não sustenta porão trancado, sótão onde alguém se esconde, alçapão por onde uma pessoa cai, corredor apertado onde duas não passam nem despensa cheia que não entulha a passagem. Cada um desses é uma situação social que a geografia precisa permitir antes que alguém possa pensar sobre ela.

O custo é de memória e não de CPU, e isso é uma consequência do desenho já declarado, não uma esperança: só o ativo é avaliado (X-013), e célula inerte não entra em varredura nenhuma por mais células que existam ao lado dela.

### W-057 — Escala do tile
`P0` · `V1` · decisão · dep: W-001, W-002

Um tile mede **0,5 m × 0,5 m**. Nunca esteve declarado, e a omissão contaminava tudo que se mede em células: alcance de visão, raio de audição, distância de interação, velocidade de caminhada e o teto do grid eram números sem unidade, ajustados por aparência.

Meio metro é a escala em que volume passa a importar sem exigir sub-tile para nada. Uma cadeira toma uma célula, uma mesa toma quatro, uma pessoa toma boa parte de uma, e um vão de porta de um metro tem duas células de largura — que é por onde duas pessoas não passam ao mesmo tempo.

Toda grandeza espacial nasce em metros e chega a células dividida por esta escala; nenhuma constante em células vive em código (X-008). As três consequências imediatas são de calibragem, e todas para cima: um alcance de visão de 30 m são 60 células e não 12; uma caminhada de 1,4 m/s atravessa 2,8 células por segundo simulado e não 0,07; e o teto do grid precisa subir, porque 128 células passam a valer 64 m (W-058). Os valores hoje em configuração foram escolhidos sem unidade e precisam ser reescritos a partir de metros.

**Aceite:** a escala em metros por célula é declarada em `config/tuning.json`; todo alcance, raio e velocidade da configuração é derivável de uma distância em metros dividida por ela; e alterar a escala num único lugar reescala visão, audição, interação e movimento juntos, sem edição de código.

### W-058 — Teto do grid e armazenamento esparso
`P0` · `V1` · decisão · dep: W-001, W-057, X-013

O teto sobe de 128×128 para **512×512**. A 0,5 m por célula, 128 células dão 64 m de lado — menos que um quarteirão, e pequeno demais para uma vila com arredores, campo e caminho entre lugares. 512 dão 256 m, que acomoda povoado inteiro com o que existe em volta dele.

**O custo é aceitável e a razão é precisa: o substrato avalia apenas o que está ativo (X-013), então um grid maior multiplica memória, não CPU.** Quadruplicar o lado multiplica por dezesseis a quantidade de células inertes, e célula inerte não entra na matriz de reação, não entra em campo calculado, não entra em varredura de vizinhança e não entra no pathfinding além do trecho consultado. O tick não sabe o tamanho do mapa.

Para que a memória também não cresça com a área, o que é raro é guardado de forma **esparsa**: conforme `TileOverlay`, estados transientes, coberturas, líquidos, gases, objetos guardados e ocupação vivem em estrutura indexada pela célula afetada, nunca em matriz densa. Célula ausente é célula intacta. Só o que toda célula sempre tem — tipo, material e `baseHeight` — justifica matriz densa, e são justamente os campos pequenos; no save essas três viram `GridTileLayers`, com paleta e codificação por repetição, porque um grid recém-gerado é quase todo a mesma coisa e 262 mil posições cabem em algumas dezenas de números sem perda.

O que é materializado a partir das duas fontes é um `Tile`: ele é a **visão montada** de uma célula, e não a forma como ela é guardada.

**Aceite:** um grid 512×512 sem nenhuma célula em estado ativo custa tempo de tick indistinguível de um 64×64 nas mesmas condições; e a memória ocupada por estados, coberturas, líquidos e ocupação cresce com o número de células afetadas, nunca com a área do grid.

### W-059 — Grid como entidade
`P0` · `V2` · decisão · dep: W-001, W-058

Conforme `Grid`. Um mundo tem um **grid principal** — a superfície, onde a geração procedural trabalha e onde os agentes nascem — e qualquer número de **grids adicionais**, cada um com identificador, rótulo legível, largura, altura e regra de alinhamento. Segundo andar, porão, adega, caverna, interior de uma caixa: todos são grids, e a diferença entre eles é apenas a regra de alinhamento (W-060, W-061).

Tile e objeto declaram a que grid pertencem; a ausência do campo significa o principal, o que mantém um mundo de um só plano exatamente tão barato quanto era antes.

Grid é também a **unidade de escopo**: pathfinding, campos calculados e varredura do substrato acontecem dentro de um grid e cruzam a fronteira apenas pelos caminhos declarados (W-060, R-051). É o que impede o número de grids de multiplicar custo por si só.

**Aceite:** carregar um mundo com três grids devolve três malhas endereçáveis de forma independente, cada célula identificada sem ambiguidade pelo par grid e coordenada, e um mundo declarado sem grid adicional nenhum não paga custo algum pelo mecanismo.

### W-060 — Grids alinhados
`P0` · `V2` · decisão · dep: W-059

Um grid **alinhado** (`alignment: aligned`) partilha o sistema de coordenadas do principal: a célula `(x, y)` de um andar corresponde à célula `(x, y)` de quem está embaixo, e é essa correspondência que faz um buraco no chão levar ao lugar certo em vez de a um lugar qualquer. Empilham por `zLevel`, maior por cima.

`originOffset` desloca a origem do grid para que ele possa ser **menor que a planta baixa**. Um sótão que cobre metade da casa é um grid de 20×14 com deslocamento, não um grid do tamanho do mapa com quase tudo vazio — e a diferença aparece direto na memória, que é o recurso que W-058 gasta.

Fora do retângulo de um grid alinhado não existe célula, e não existir célula não é o mesmo que existir célula vazia: o que estiver caindo ali continua caindo até o primeiro grid abaixo que tenha célula naquela coordenada.

Uma célula declara, no seu chão, se ele é **fechado ou aberto**: buraco, alçapão aberto, laje que desabou, vão de escada, poço. Abertura é a única fronteira permeável entre dois grids alinhados, e é ela que W-062, W-048, R-051 e R-052 consultam — não existe um segundo mecanismo de ligação entre andares.

**Aceite:** a célula `(10, 4)` de um grid com deslocamento `(8, 3)` resolve para a célula `(18, 7)` do grid imediatamente abaixo, a resolução inversa devolve o mesmo par, e uma coordenada fora do retângulo do grid superior resolve direto para o grid de baixo que a contenha; abrir e fechar o chão de uma célula é editável em separado do tipo e do material dela.

### W-061 — Grids destacados
`P1` · `V3` · decisão · dep: W-059, W-044

Um grid **destacado** (`alignment: detached`) é espaço extraespacial: **não corresponde a lugar nenhum**. Não tem `zLevel` com significado, não tem célula correspondente em grid algum, e nada dentro dele está acima ou abaixo de nada fora dele. Interior de um baú grande demais para o que é, bolso dimensional, cômodo que só existe enquanto a porta está aberta.

Um destacado declara **uma única entrada** — a célula, em outro grid, onde ele se abre. Uma e não várias, porque duas entradas em lugares distintos transformariam o espaço destacado num atalho geográfico entre dois pontos do mapa, e é exatamente isso que ele não é. Com uma entrada, ele é um lugar; com duas, é um túnel, e túnel se constrói com grid alinhado.

Grid destacado **sem** entrada é inalcançável, e lugar inalcançável não é lugar: é estado que existe, consome memória e save, e nunca participa de nada. A validação de mapa recusa na carga, nomeando o grid, pelo mesmo caminho com que recusa uma casa isolada (W-044).

**Aceite:** carregar um mundo com grid destacado sem célula de entrada declarada falha nomeando o grid; com entrada declarada, o pathfinding encontra caminho de qualquer célula alcançável até dentro dele, e todo caminho encontrado passa pela célula de entrada.

### W-062 — Queda entre grids alinhados
`P1` · `V5` · derivado · dep: W-060, W-063, B-022, O-011

Quem entra numa célula de chão aberto (W-060) sem ter apoio cai. A queda resolve **dentro do tick**, pelo mesmo raio instantâneo de O-011 e pela mesma razão econômica: a engine desce pela coluna de células correspondentes — resolvidas pelo deslocamento de W-060 — até o primeiro chão fechado, assenta a entidade ali e soma a altura percorrida. Nada fica em voo entre ticks.

**A queda não tem resolução de dano própria.** A altura percorrida — as alturas de grid atravessadas mais a diferença de `baseHeight` entre partida e chegada — entra na matriz de lesão como dano do tipo `blunt`, pelo caminho já declarado em B-022, onde "queda contunde" sempre esteve. Não existe tabela de queda, não existe condição de queda inventada aqui, e a gravidade local (W-065) entra apenas como multiplicador da severidade que a matriz recebe. A escolha de parte atingida, a condição produzida e a severidade continuam sendo problema da matriz.

Objeto cai pelo mesmo caminho e sem sistema paralelo: é o canal de arremesso de O-011 apontado para baixo, e o objeto atravessa a abertura em vez de parar sobre ela.

**Aceite:** um agente que entra numa célula de chão aberto termina o mesmo tick na célula correspondente do primeiro grid de chão fechado abaixo dela, e recebe uma condição produzida pela matriz de lesão a partir de dano `blunt` proporcional à altura somada; nenhuma regra de dano por queda existe fora dessa matriz.

### W-063 — Altura contínua do solo e do material
`P0` · `V2` · decisão · dep: W-057, W-060

Duas alturas por célula, ambas em metros e ambas contínuas. `baseHeight` é a altura do **solo**. `tileHeight` é a altura do **material que está sobre o solo**.

São campos separados porque descrevem coisas com destinos diferentes, e o campo único anterior — `elevation` — tornava as duas indistinguíveis. Uma mureta de pedra sobre terreno plano tem `baseHeight` zero e `tileHeight` de meio metro: derrubá-la zera `tileHeight` e não toca no solo. Um degrau de rocha viva tem `baseHeight` de meio metro e `tileHeight` zero: não há o que derrubar, e o líquido que chega ali nunca mais desce por conta própria. Com um campo só, destruir uma parede rebaixava o terreno e a água passava a escorrer por onde antes havia pedra.

Escoamento de líquido, assentamento de gás pesado e cálculo de queda leem `baseHeight`. Bloqueio de movimento, de visão e de projétil lê a **soma das duas** contra a altura de quem passa — é o que faz uma mureta cobrir sem impedir e uma parede impedir.

**Aceite:** destruir a mureta de um tile zera sua `tileHeight` e mantém `baseHeight` inalterado, e o escoamento de líquido pela célula passa a ser idêntico ao de uma célula vizinha de mesmo solo; uma entidade mais alta que a soma das duas alturas mantém linha de visão sobre a célula, e uma mais baixa não.

### W-064 — Interpolação de valores contínuos
`P0` · `V2` · decisão · dep: W-063, W-066, R-007

Uma entidade que ocupa mais de uma célula **não lê o valor de uma célula só**: recebe a média dos valores das células que toca, ponderada pela fração de si que está em cada uma. Vale para todo escalar contínuo do tile — temperatura, pressão, gravidade e altura.

Meio metro é pequeno o bastante para uma pessoa ocupar duas ou quatro células ao mesmo tempo (W-057), e sem ponderação um agente com um pé na poça de lava e o outro no chão frio leria a temperatura da célula em que o centro dele por acaso caiu. Além de errado, produz descontinuidade visível: o valor salta ao andar, o salto não corresponde a nada no mundo, e cadeias de reação disparam ou não disparam por um décimo de célula.

A ponderação é aritmética sobre células que a entidade já toca para efeito de colisão, então não acrescenta varredura nem escala com o tamanho do grid.

**Aceite:** uma entidade com 60% de sua área numa célula a 100 °C e 40% numa célula a 0 °C lê 60 °C; deslocá-la um décimo de célula altera o valor lido de forma contínua, sem salto; e o mesmo se verifica para gravidade e para altura do solo.

### W-065 — Gravidade local
`P2` · `V5` · derivado · dep: W-064, W-062

Cada célula pode declarar um **multiplicador** de gravidade. O padrão é 1, e a ausência do campo equivale a 1 — o caso de praticamente todo o mapa, que assim não custa nada. O multiplicador escala a aceleração da queda, a severidade do dano que a queda entrega à matriz de lesão (W-062), o alcance de um arremesso e o peso efetivo do que se carrega.

É multiplicador e não vetor porque a única direção que um mundo 2.5D tem é para baixo. Um número por célula cobre poço de gravidade fraca, câmara pesada em que ninguém corre e um grid destacado com regra própria, sem introduzir física direcional que o projeto não quer.

**Aceite:** um objeto solto numa célula com multiplicador 0,5 leva mais tempo para alcançar o grid de baixo e entrega severidade menor à matriz de lesão que o mesmo objeto solto da mesma altura com multiplicador 1; e uma célula sem o campo declarado se comporta de forma idêntica a uma com multiplicador 1.

### W-066 — Ocupação da célula
`P1` · `V2` · decisão · dep: W-057, W-059

Cada célula registra **quanto do seu volume está tomado e por quem**. Objeto grande e imóvel, pessoa e objeto físico solto entram todos na mesma conta; o que está guardado não entra (W-067).

A fração ocupada governa três coisas, e as três só fazem sentido porque a célula tem meio metro. **Passagem:** acima de um limiar declarado em tuning a célula deixa de ser atravessável, e o A* a evita sem que ninguém a tenha declarado parede — uma sala entulhada fica intransitável por acúmulo, e desentulhar devolve a passagem. **Cobertura:** ocupação parcial abriga quem está atrás, e é ela que o raio de arremesso de O-011 consulta para decidir se interceptou o abrigo ou quem estava atrás dele. **Aperto:** duas pessoas na mesma célula ainda cabem, com penalidade de movimento proporcional ao que sobra, e é isso que impede uma multidão de atravessar um vão de porta como se ele não existisse.

A quem lê o mundo, essas três coisas aparecem como fatos comuns: o corredor é estreito, o depósito está cheio, há gente demais na porta. Nenhuma delas exige regra própria.

**Aceite:** encher uma célula com objetos físicos até cruzar o limiar de passagem faz o A* desviar dela na travessia seguinte, sem que o tipo do tile mude; retirar um objeto a devolve ao caminho; um agente atrás de célula parcialmente ocupada expõe fração de corpo menor que um a descoberto; e dois agentes na mesma célula se movem mais devagar que um sozinho.

### W-067 — Armazenamento na célula
`P1` · `V2` · decisão · dep: W-066, O-009

**A própria célula é um lugar de armazenamento**, sem precisar de recipiente. Canto de despensa, prateleira, pilha de lenha junto à parede, monte de ferramentas no chão da oficina: o objeto está guardado ali e não em algo. A célula tem um teto de **volume efetivo** declarado em tuning — a soma dos volumes já multiplicados pelo empacotamento de O-002 —, e exceder o teto recusa o objeto em vez de aceitá-lo em silêncio, do mesmo jeito que um recipiente cheio recusa (O-003).

O que guardar significa está declarado uma vez em O-009 e não é redito aqui: o objeto deixa de ser físico. O que este requisito acrescenta é a consequência **para a célula**: guardado não entra na ocupação (W-066), então encher um canto de despensa não fecha a passagem por acúmulo nem dá cobertura a quem se abrigue atrás — que é exatamente a diferença entre guardar as coisas e entulhar o cômodo. Entulho é objeto físico solto; despensa é objeto guardado. As duas situações são visualmente parecidas, mecanicamente opostas, e é o usuário que escolhe qual está criando.

Sem armazenamento de célula, ou toda pilha de lenha exige um recipiente invisível que ninguém construiu, ou cada acha de lenha paga colisão e ocupação pelo resto da partida — e a maior parte dos objetos de um mundo habitado está parada em cantos assim.

**Aceite:** guardar objetos numa célula até o teto de volume efetivo não altera sua ocupação nem a torna bloqueada, e um arremesso atravessa a célula sem acertar nenhum deles; os mesmos objetos soltos na mesma célula cruzam o limiar de passagem de W-066 e bloqueiam; exceder o teto recusa o objeto com retorno diegético.

### W-068 — Pressão ambiente
`P2` · `V5` · derivado · dep: W-064, B-012

Cada célula pode declarar uma **pressão ambiente**, em atmosferas. Como a gravidade de W-065, o padrão é 1, a ausência do campo equivale a 1, e é o caso de praticamente todo o mapa — o que torna o campo gratuito onde ele não importa.

Ela é um **descritor ambiental, e não fluidodinâmica**. A distinção precisa ser dita porque o nome sugere o contrário e porque este documento declara hidrodinâmica com pressão como não-objetivo, o que é uma contradição aparente com a existência do campo. Pressão aqui não empurra, não escoa, não equaliza entre células vizinhas e não move gás nenhum: quem move gás é a difusão de R-023, que não a consulta. Ela é lida, interpolada como qualquer contínuo (W-064), e nada mais.

O que ela governa é estreito de propósito: fora de uma faixa declarada em tuning, ela degrada a capacidade de respiração que já existe em B-012, e o desvio entra na percepção como desconforto. Isso é suficiente para que uma câmara selada, uma profundidade e um grid destacado com regra própria signifiquem alguma coisa mecanicamente, sem que nenhum sistema novo nasça para sustentá-las. Dentro da faixa normal o campo não faz absolutamente nada, e é essa inércia que o mantém barato.

A escolha é deliberadamente conservadora. Um campo lido por um sistema só, com faixa morta larga, pode ganhar consumidores depois sem quebrar nada; uma simulação de pressão que empurra fluido tem que estar certa desde o primeiro dia, e nunca é o que decide se uma história é interessante.

**Aceite:** uma célula sem o campo declarado se comporta de forma idêntica a uma com pressão 1, e nenhuma célula altera a pressão de sua vizinha ao longo de qualquer número de ticks; um agente numa célula fora da faixa declarada tem a capacidade de respiração reduzida e percebe o desconforto, e um dentro da faixa não sofre efeito algum.
