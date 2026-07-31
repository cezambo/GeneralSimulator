# SPEC-U — Interface

Render, câmera, modo construção, painéis de inspeção e controles de simulação.

O cliente de render é o Godot; os painéis de dados são web. A divisão e o motivo estão em [ADR-001](../adr/ADR-001-stack.md).

---

## A tese

A interface tem dois trabalhos que não se parecem. Um é **desenhar o mundo**, e é trabalho de jogo: tilemap, câmera, sprites. O outro é **abrir a cabeça dos agentes**, e é trabalho de ferramenta de depuração: tabelas, texto, trilhas.

Confundir os dois produz um editor de dados dentro de um motor de jogo, que é caro e ruim. Separá-los é o que permite que a parte visual seja simples e a parte analítica seja densa.

O critério de corte para tudo aqui: **serve para entender por que um agente fez o que fez?** Se não serve, é enfeite.

---

## Mundo

### U-001 — Render top-down
`P0` · `V1` · PDF 1-6 · dep: W-001

Vista superior do grid, com tiles, objetos e agentes desenhados a partir do estado recebido do núcleo.

**Aceite:** um mapa construído à mão é desenhado corretamente a partir de um save.

### U-002 — Câmera
`P0` · `V1` · PDF 1-6 · dep: U-001

Deslocamento e zoom com limites, sem travar em células do grid.

**Aceite:** aproximar e afastar preserva o centro visado e respeita os limites do mapa.

### U-003 — Relógio e velocidade
`P0` · `V1` · PDF 7-8 · dep: W-053

Pausa, retomada e múltiplas velocidades de simulação, com hora e data simuladas sempre visíveis.

**Aceite:** pausar congela a simulação sem congelar a interface, e a velocidade escolhida se mantém entre pausas.

### U-004 — Cone de visão
`P1` · `V1` · PDF 39-40 · dep: A-008

Interruptor de depuração que desenha o cone de todos os agentes ou apenas do selecionado.

**Aceite:** ligar e desligar não altera nada na simulação.

### U-005 — Sinais corporais visíveis
`P1` · `V5` · derivado de B-032 · dep: B-032

Mancar, tipoia, palidez, sangue na roupa e demais sinais derivados de condições e coberturas aparecem no agente desenhado.

**Aceite:** um agente ferido é visualmente distinguível de um saudável sem abrir painel.

---

## Modo construção

### U-006 — Alternância de modo
`P0` · `V2` · PDF 101-107 · dep: U-001

Entrar em construção pausa a simulação automaticamente; sair retoma no estado anterior.

**Aceite:** alternar não perde estado de simulação nem de edição.

### U-007 — Overlay de grid
`P0` · `V2` · PDF 101-107 · dep: U-006

Grade visível apenas em construção, com alinhamento claro ao sistema de tiles.

**Aceite:** a grade coincide exatamente com as células reais.

### U-008 — Ferramentas de edição
`P0` · `V2` · PDF 101-107 · dep: U-006

Pintar, remover e rotacionar tiles, móveis e itens.

**Aceite:** cada ferramenta altera o estado persistido e é refletida no render imediatamente.

### U-009 — Menu por abas
`P0` · `V2` · PDF 101-110 · dep: U-008

Abas para tiles, móveis, itens e customizados, alimentadas pelo catálogo de dados.

**Aceite:** um item adicionado ao catálogo aparece no menu sem alteração de código.

### U-010 — Item customizado
`P1` · `V3` · PDF 105-107 · dep: U-009 · prompt: `generation.custom_item`

Botão que cria item novo a partir de nome, descrição e categoria fornecidos pelo usuário.

**Aceite:** um item criado assim é posicionável, salvo e restaurado como qualquer outro.

### U-011 — Manipulação direta
`P1` · `V2` · PDF 101-107 · dep: U-008

Passagem do cursor com dica, cursor de mão aberta e fechada, arrastar e soltar.

**Aceite:** arrastar um móvel o reposiciona e a dica mostra nome e material.

### U-012 — Desfazer e refazer
`P1` · `V2` · PDF 101-107 · dep: U-008

Pilha de edições com desfazer e refazer, limitada ao modo construção.

**Aceite:** dez edições seguidas são desfeitas e refeitas na ordem correta.

### U-013 — Salvar e carregar
`P0` · `V2` · PDF 101-107 · dep: X-003

Persistência do mundo construído, com recarga idêntica.

**Aceite:** construir, salvar, fechar e reabrir produz mundo idêntico.

---

## Inspeção

### U-014 — Inspetor de agente
`P0` · `V5` · PDF 88-90 · dep: A-001

Painel com identidade, corpo, personalidade, habilidades, inventário, relações, opiniões, memórias, metas e registro de atividade.

Leitura é o caso principal. Edição existe apenas onde o usuário legitimamente injeta conteúdo — memória, meta e instrução — não como editor genérico de estado.

**Aceite:** selecionar um agente mostra seu estado corrente sem disparar nenhuma chamada de LLM.

### U-015 — Balão de pensamento
`P1` · `V5` · PDF 88-90 · dep: C-009

O último monólogo interior aparece junto ao agente, com alternância de visibilidade.

**Aceite:** o balão mostra o pensamento mais recente e some quando desligado.

### U-016 — Injeção do usuário
`P2` · `V5` · PDF 99-100 · dep: C-021, C-039

Criar memória ou meta num agente pela interface, marcadas como criadas pelo usuário.

**Aceite:** o conteúdo injetado entra no próximo contexto de pensamento.

### U-017 — Pausa individual
`P2` · `V5` · derivado de A-004 · dep: A-004

Congelar um agente específico, para depuração e economia.

**Aceite:** o agente pausado não gera chamada enquanto o resto da simulação corre.

### U-018 — Visualizador de trace
`P1` · `V4` · derivado de L-021 · dep: L-021

A partir de qualquer evento, abrir o prompt renderizado, a resposta bruta e o resultado da validação que o produziram.

É o painel que responde "por que ele fez aquilo", e é a razão de a camada de cassetes existir.

**Aceite:** qualquer decisão pode ser aberta até o texto exato enviado ao modelo.

---

## Controle e custo

### U-019 — Configuração de modelos
`P0` · `V0` · derivado de L-005 · dep: L-005

Seletor de preset, campo de chave, teste de conexão e modo de execução — ao vivo, híbrido ou replay.

A escolha fina de modelo por tier é edição de arquivo de configuração. Uma interface completa de navegação sobre centenas de modelos é produto caro para uma tarefa que se resolve em três nomes.

**Aceite:** trocar o preset altera os três tiers e vale na próxima chamada.

### U-020 — Custo e orçamento
`P0` · `V4` · derivado de L-016 · dep: L-016

Custo acumulado da sessão, custo por dia simulado, projeção, e marcação explícita dos agentes em degradação por orçamento.

**Aceite:** um agente que estourou o teto aparece marcado com a hora simulada em que degradou.

### U-021 — Instruções ao Validador
`P1` · `V4` · derivado de V-034 · dep: V-034

Edição das instruções ativas ao Validador durante a simulação.

**Aceite:** alterar a instrução muda o comportamento na próxima invocação, sem reiniciar.

### U-022 — Painel de regras provisórias
`P1` · `V4` · derivado de V-025 · dep: V-025, V-028

Lista das regras promovidas pelo Validador com origem, contagem de disparos e ações de promover ou rejeitar; e a lista de métodos recorrentes que ainda não viraram regra.

É o único painel de observabilidade do projeto que se paga em dinheiro: cada regra promovida é uma chamada que deixa de existir.

**Aceite:** promover uma regra a permanente e rejeitar outra alteram o comportamento a partir da invocação seguinte.

---

## Pré-jogo e saída

### U-023 — Tela pré-jogo
`P0` · `V3` · PDF 3-13 · dep: A-030

Número de agentes e descrição livre do cenário, alimentando a geração de terreno e de perfis.

**Aceite:** uma descrição em texto livre produz mundo e elenco coerentes com ela.

### U-024 — Linha do tempo
`P2` · `V7` · derivado de V-033 · dep: V-033

Eventos narrados em ordem cronológica, com filtro por agente e por tipo, navegáveis até o trace.

**Aceite:** filtrar por um agente mostra apenas os eventos em que ele participou ou testemunhou.

### U-025 — Minimapa
`P2` · `V7` · derivado · dep: U-001

Visão reduzida do mapa com posição dos agentes e do enquadramento corrente.

**Aceite:** clicar no minimapa move a câmera para o ponto correspondente.

### U-026 — Exportação narrativa
`P2` · `V7` · derivado de V-033 · dep: V-033

Exportar a partida como texto legível em ordem cronológica.

**Aceite:** a exportação de trinta dias simulados produz narrativa legível de ponta a ponta.

---

## Não-objetivos

**Editor genérico de estado.** O inspetor lê. Escrita existe só onde o usuário injeta conteúdo por desenho.

**Navegador completo de catálogo de modelos.** Preset na interface, ajuste fino em arquivo.

**Animação de personagem.** Sprites e orientação bastam; nada de esqueleto nem ciclo de passos.

**Interface de combate.** Não há sistema tático a expor.
