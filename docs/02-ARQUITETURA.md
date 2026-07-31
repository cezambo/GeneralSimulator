# Arquitetura e Estrutura do Projeto

Este documento responde: **qual a maneira mais inteligente de estruturar este projeto e seus requisitos.**

---

## 1. A observação que define a estrutura

Este projeto parece um jogo, mas não é um projeto de jogo. Medindo por onde o esforço realmente vai:

| Área | Peso real |
|------|-----------|
| Orquestração de LLM, máquinas de estado, gestão de memória e contexto | ~60% |
| UI de dados (inspetor de agente com 10 abas, timeline, logs, seletor de modelos) | ~25% |
| Renderização top-down de tilemap, câmera, pathfinding | ~15% |

Renderizar um grid 2D visto de cima é a parte fácil e resolvida. O que faz o projeto viver ou morrer é conseguir **iterar rápido sobre comportamento emergente de 35 prompts interagindo** — e conseguir entender *por que* algo aconteceu.

Toda decisão estrutural abaixo deriva disso.

---

## 2. Decisão estrutural nº 1 — separar núcleo headless do cliente

```
sim-core  (sem renderização, sem UI, roda em terminal)
   ├── mundo, grid, tiles, materiais, pathfinding
   ├── agentes, cognição, memória, opiniões, metas
   ├── GM, mediação, mutações de mundo
   ├── orquestrador de LLM (filas, budget, retry, cassetes)
   └── relógio de simulação + barramento de eventos
        ▲
        │ API de observação e comando
        ▼
sim-client  (renderização + UI)
   ├── mapa top-down, câmera, hover, drag
   ├── modo construção
   ├── painéis (agente, GM, debug, seletor de modelos)
   └── timeline e visualizador de trace
```

**Por que isso é o ponto de maior alavancagem:**

- Dá pra rodar 30 dias de simulação headless durante a noite e ler o resultado de manhã, sem UI e sem ninguém assistindo. É a única forma prática de descobrir se a waterfall de memória produz agentes coerentes no dia 20.
- Testes de cognição não dependem de clicar em nada.
- Trabalho de UI e trabalho de cognição deixam de se bloquear.
- Se o cliente precisar ser trocado depois, o núcleo sobrevive.

A regra: **`sim-core` nunca importa nada de renderização.** Se essa regra for quebrada uma vez, o benefício todo evapora.

---

## 3. Decisão estrutural nº 2 — requisitos com ID rastreável

O PDF tem centenas de exigências entrelaçadas. Sem identificação, é impossível responder "esse comportamento estranho vem de qual requisito, qual prompt, qual código".

Cada requisito vira uma entrada atômica e testável:

```markdown
### C-029 — Ruptura de Opinião (The Burst)

**Prioridade:** P0
**Origem:** PDF 451-460
**Depende de:** C-027 (limiar de teimosia), que por sua vez depende de C-025 (classificador de dissonância)
**Prompt:** `cognition.opinion_burst`
**Módulo:** `sim-core/cognition/opinions`
**Critério de aceite:**
  Dado buffer de dissonância > limiar de teimosia,
  então a opinião é reescrita, o buffer zera, o limiar volta ao valor base,
  e um evento `goal.reevaluate` é emitido para metas secundária e terciária.
```

Prefixos por domínio: `W-` mundo, `A-` agente, `C-` cognição, `S-` social, `G-` GM, `U-` UI, `L-` camada LLM, `X-` transversal.

Isso dá a cadeia: **requisito → prompt → módulo → teste**. Quando algo dá errado no playtest, o caminho de volta existe.

---

## 4. Decisão estrutural nº 3 — separar por cadência de mudança

O erro atual (modelo fixado dentro do registro de prompts) é um sintoma. Coisas que mudam em ritmos diferentes precisam morar em lugares diferentes:

| Camada | Muda | Onde | Editável pelo usuário |
|--------|------|------|----------------------|
| **Especificação** | raramente | `docs/spec/` | não (é decisão de design) |
| **Contratos de dados** | raramente | `schemas/` | não |
| **Prompts** | muito | `prompts/` | sim, arquivo |
| **Números de ajuste** | constantemente | `config/tuning.json` | sim, arquivo + UI |
| **Binding de modelo** | constantemente | `config/models.json` | **sim, UI** |

Todo número mágico do PDF (limiar de teimosia base, 15 tiles do filtro de transporte, 0.70 de consciência, 15 dias de ciclo sazonal, 8 dias de safety offset, raio de 20 tiles do grito) vai para `tuning.json`, num só lugar, com comentário de origem. Nenhum deles hardcoded.

---

## 5. Decisão estrutural nº 4 — gravação e replay de chamadas LLM

Sem isso, comportamento emergente é indepurável e todo teste custa dinheiro.

```
modo LIVE     → chama a API, grava requisição+resposta em cassete
modo REPLAY   → lê do cassete, custo zero, resultado idêntico
modo HYBRID   → replay do que existe, live só para chamadas novas
```

Um cassete é indexado por hash de (prompt_id + variáveis renderizadas + binding de modelo). Isso permite:

- Reproduzir exatamente o dia 7 em que o agente fez algo inesperado
- Rodar a suíte de testes de cognição sem gastar um centavo
- Trocar um prompt e ver exatamente o que muda, com todo o resto fixo
- Bissectar comportamento: qual chamada exatamente virou a chave

Isso entra na primeira fatia vertical, não no polimento.

---

## 6. Decisão estrutural nº 5 — fatias verticais, não fases horizontais

O plano anterior era horizontal: mundo inteiro → geração inteira → GM inteiro → cognição inteira. Cognição só apareceria no mês 4 ou 5. Isso significa descobrir se a premissa central funciona tarde demais para corrigir barato.

Invertendo:

| Fatia | Entrega | Pergunta que responde |
|-------|---------|----------------------|
| **V1 — Fio de vida** | 2 agentes, 1 cômodo, loop de pensamento, GM mediando, log factual. Headless + render feio. | O loop agente→GM→mundo→memória fecha e produz algo coerente? |
| **V2 — Memória e opinião** | Waterfall diária, classificador de dissonância, ruptura, metas reativas. Ainda 2–3 agentes. | Agentes mudam de ideia de forma plausível ao longo de dias? |
| **V3 — Social** | Conversas multi-agente, impressões, relato vs. log factual (mentira). | Emerge drama social sem script? |
| **V4 — Mundo** | Geração procedural, materiais, construção, itens. | O mundo suporta a cognição que já funciona? |
| **V5 — UI completa** | Inspetor de 10 abas, modo construção, seletor de modelos, timeline. | Dá pra operar e ajustar confortavelmente? |
| **V6 — Escala e extremos** | N agentes, combate, reuniões, estados mentais extremos, budget. | Aguenta 10 agentes por 30 dias? |

V1 deve estar rodando em semanas, não meses. Cada fatia é jogável/observável de ponta a ponta.

Consequência que vale aceitar: o mundo bonito vem tarde (V4). Em compensação, o risco real do projeto é atacado primeiro.

---

## 7. Stack — arranjo híbrido de três partes

**Decidido em 31/07/2026.** Ver `adr/ADR-001-stack.md` para o registro completo.

Cada parte do sistema usa a ferramenta que é melhor naquilo:

| Parte | Tecnologia | Por quê |
|-------|-----------|---------|
| **`sim-core`** — simulação, cognição, GM, LLM | TypeScript / Node | Lógica complexa e tipada, orquestração assíncrona, manipulação de JSON. Melhor assistência de IA. Testável isolado com `vitest`, sem editor nem render. |
| **`client-godot`** — mundo, câmera, input, UI in-world | Godot 4 + GDScript | Tilemap, transforms contínuos, câmera e pathfinding prontos. Cliente fino, onde GDScript é adequado. Não precisa da build .NET nem de `.csproj`. |
| **`panel-web`** — painéis densos de dados | React | Inspetor de 10 abas, seletor de 364 modelos, timeline, visualizador de trace, dashboard de custo. Rápido de construir e o agente consegue inspecionar via ferramentas de navegador. |

### Divisão de UI

O que fica em cada lado não é arbitrário:

**No Godot** — tudo que precisa estar sobre o mapa: tooltip de hover, estados do cursor (mão aberta/fechada), arrastar e soltar, menu de contexto do botão direito, paleta do modo construção, barra de play/pause/velocidade.

**No painel web** — tudo que é leitura e edição densa: inspetor completo do agente, configuração de modelos, instruções ao GM, timeline de eventos, visualizador de trace, custo. Abre em janela separada ao lado do jogo. Clique num agente no Godot foca o painel naquele agente.

### O custo real deste arranjo

Duas fronteiras de processo em vez de zero. Toda funcionalidade que atravessa o limite exige trabalho de protocolo — não dá pra simplesmente chamar uma função. A mitigação é disciplina de protocolo desde o início (`05-PROTOCOLO.md`) e manter o cliente **fino de propósito**: se lógica de simulação começar a vazar para o GDScript, o arranjo perde a razão de existir.

Em compensação, a separação núcleo/cliente da seção 2 deixa de ser uma regra de disciplina e passa a ser fisicamente imposta — é impossível o núcleo importar render.

---

## 8. Layout do repositório

```
simulador-interacoes/
├── docs/
│   ├── AUDITORIA.md
│   ├── 00-VISAO.md
│   ├── 01-GLOSSARIO.md
│   ├── 02-ARQUITETURA.md          ← este arquivo
│   ├── 03-CAMADA-LLM.md
│   ├── 04-ROADMAP.md
│   ├── spec/
│   │   ├── SPEC-W-mundo.md
│   │   ├── SPEC-A-agente.md
│   │   ├── SPEC-C-cognicao.md
│   │   ├── SPEC-S-social.md
│   │   ├── SPEC-G-gm.md
│   │   ├── SPEC-U-ui.md
│   │   ├── SPEC-L-llm.md
│   │   └── SPEC-X-transversal.md
│   └── adr/                        ← decisões arquiteturais datadas
├── schemas/                        ← JSON Schema canônico (fonte única)
├── prompts/                        ← biblioteca editável (já existe)
├── config/
│   ├── models.json                 ← binding role→modelo (editável pela UI)
│   └── tuning.json                 ← todos os números ajustáveis
├── cassettes/                      ← gravações de LLM para replay
└── packages/                       ← código
```

---

## 9. Fonte única para contratos de dados

Hoje há duplicação: schemas em `prompts/_shared/output_schemas.json` e JSON inline dentro de vários prompts.

Correção: `schemas/` passa a ser a fonte única, em JSON Schema. Dele derivam:

- tipos TypeScript (geração automática)
- validação em runtime das respostas de LLM
- o trecho de schema injetado no prompt

Prompt nenhum define JSON inline. Todos referenciam um schema por nome.

---

## 10. Ordem de execução recomendada

1. Persistir visão, glossário e especificação com IDs (a espinha)
2. Fechar `schemas/` como fonte única
3. Definir o contrato do carregador de prompts (includes, variáveis, binding de schema)
4. Camada LLM com OpenRouter + cassetes (`03-CAMADA-LLM.md`)
5. Completar os ~16 prompts faltantes, começando pelo classificador de dissonância
6. Fatia V1
