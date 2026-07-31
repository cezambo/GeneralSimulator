# SPEC-W — Mundo

Grid, tiles, materiais, objetos, geração, tempo e espaço.

Nada aqui consulta LLM em runtime, exceto a geração de pré-jogo.

O substrato reativo que roda **sobre** esta geografia — reações, temperatura, líquidos, gases, coberturas, percepção — está em [SPEC-R-substrato.md](SPEC-R-substrato.md).

---

## Grid e espaço

### W-001 — Grid discreto de tiles
`P0` · `V1` · PDF 2 · dep: —

Matriz de tiles indexada por coordenadas inteiras. Entre 32×32 e 128×128.

**Aceite:** qualquer célula é endereçável por `(x, y)`.

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

**Aceite:** chão de madeira com teto de palha e sem parede coexistem, cada camada editável em separado.

### W-008 — Oclusão de visão
`P1` · `V1` · derivado de PDF 39-40 · dep: W-003, A-007

Linha de visão interrompida por tiles bloqueantes. Telhado de ambiente fechado é ocultado quando a câmera precisa mostrar o interior.

**Aceite:** agente atrás de parede não é percebido; atrás de janela é.

### W-009 — Setores nomeados
`P1` · `V1` · derivado de PDF 262-263 · dep: W-001

Subdivisões identificadas. O `ActivityLog` registra o setor de cada ação.

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

Este catálogo é **um só para todo o simulador**. Os tecidos do corpo — pele, músculo, órgão, nervo, gordura — são entradas dele, no mesmo formato (B-003). `osso` já estava na lista acima antes de existir sistema de corpo, e continua sendo uma entrada única que serve tanto para um porrete quanto para um fêmur. É essa unificação que permite ao GM transmutar o material de uma parte do corpo sem código novo (B-038).

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

### W-014 — Descrição textual para o GM
`P1` · `V4` · PDF 119-120 · dep: W-011, R-041

Materiais complexos carregam descrição em prosa, injetada no contexto do GM.

**Aceite:** ao mediar ação sobre mármore antigo, o prompt do GM contém a descrição.

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

**Affordance-first (determinístico):** se a intenção do agente mapeia a uma affordance declarada, a **engine executa sem LLM de GM**. O GM só entra quando não há affordance que cubra a ação.

**Aceite:** sentar numa cadeira com affordance `sentar` resolve na engine; contexto do agente inclui affordances disponíveis.

### W-032 — Containers
`P1` · `V2` · derivado · dep: W-030

Objetos contêm outros, com capacidade.

**Aceite:** item guardado num baú some do mundo e volta ao ser retirado.

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

Elevação, biomas, água em quatro estilos, vegetação, estradas.

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

**Aceite:** mapa com casa inalcançável é rejeitado apontando a região isolada.

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

**Aceite:** o agente contorna parede; fechar porta no caminho força recálculo.

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

Pausado, 1×, 2×, 4×, 8×. Em 8× o tier `deep` é desabilitado.

**Aceite:** troca imediata; pausa congela todo avanço de estado, inclusive o sistema reativo.

### W-053 — Calendário
`P1` · `V1` · PDF 244-250 · dep: W-051

Dia, estação de 15 dias, ano de 4 estações. Escala configurável.

**Aceite:** gatilhos sazonal e anual disparam nos limites corretos.

### W-054 — Ciclo dia e noite
`P1` · `V1` · derivado de PDF 242 · dep: W-051

Governa sono, iluminação e visibilidade.

**Aceite:** agentes dormem no horário da rotina e a sumarização diária dispara ao dormir.

### W-055 — Clima
`P2` · `V4` · PDF 489-491 · dep: W-053, R-040

Estado climático que entra no contexto contemplativo e alimenta o substrato — chuva molha e apaga, vento modula propagação, frio congela, calor seca.

**Aceite:** chuva apaga incêndio ativo por meio de `extinguish`, sem regra especial de clima.

### W-056 — Agendador de eventos
`P0` · `V1` · derivado · dep: W-051

Fila temporizada para sumarizações, pensamentos espontâneos, decaimento de necessidades, degradação e reuniões.

**Aceite:** evento agendado dispara no tick previsto, inclusive após salvar e recarregar.
