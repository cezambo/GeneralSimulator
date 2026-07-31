# Biblioteca de Prompts — Simulador de Interações

Todos os prompts do projeto vivem aqui como arquivos Markdown editáveis. **Não estão hardcoded no código.**

## Como funciona

1. **`prompt_registry.yaml`** — índice central: mapeia ID → arquivo → variáveis → **tier**.

   Prompt **não** declara modelo. Declara o tier e as capacidades exigidas. O binding tier → modelo/provedor vive em `config/models.json` e é editável pela UI. Ver `docs/03-CAMADA-LLM.md`.
2. **`_shared/system_rules.md`** — regras globais injetadas em todo prompt de agente/GM.
3. **`prompts/**/*.md`** — templates com blocos `## System` e `## User Template`.
4. **Runtime** — engine carrega YAML, lê `.md`, substitui `{{variáveis}}`, envia ao Gemini.

## Estrutura de pastas

```
prompts/
├── prompt_registry.yaml      ← índice (comece aqui)
├── README.md                 ← este arquivo
├── _shared/
│   ├── system_rules.md       ← regras globais
│   └── output_schemas.json   ← schemas JSON de resposta
├── generation/               ← pré-jogo
├── agent/                    ← pensamento e intenção
├── memory/                   ← sumarização
├── cognition/                ← opiniões e objetivos
├── social/                   ← conversas
├── community/                ← reuniões
└── gm/                       ← Game Master
```

## Anatomia de um prompt

Cada arquivo `.md` segue este formato:

| Seção | Propósito |
|-------|-----------|
| **Metadados** | ID, role, modelo, quando usar |
| **Variáveis** | Lista do que o engine injeta |
| **System** | Instruções fixas de comportamento |
| **User Template** | Template com `{{placeholders}}` |
| **Output Schema** | JSON esperado na resposta |
| **Notas de teste** | Dicas para calibrar em playtest |

## Variáveis comuns

| Variável | Conteúdo |
|----------|----------|
| `{{agent_context}}` | Bloco composto: identidade, corpo, personalidade, memórias relevantes, opiniões, objetivos, inventário |
| `{{affordances}}` | Lista do que o agente pode fazer agora (engine) |
| `{{world_snapshot}}` | Tiles, objetos e agentes num raio relevante |
| `{{user_instructions}}` | Instruções ativas do usuário ao GM |
| `{{trigger_type}}` | reactive / idle / scheduled / post_interaction / post_denial |

### Estado do corpo e do mundo entra como prosa

A simulação por baixo é detalhada — vinte e cinco partes de corpo, capacidades derivadas, estados de tile, coberturas. **Nada disso vai cru para o prompt.**

O que entra é descrição curta e saliente: *"seu braço esquerdo está quebrado e dói muito"*, não `braço_esq: 0.0 · manipulação: 0.51 · dor: 0.62`.

O gargalo econômico do projeto é token de contexto, não CPU. É essa separação — rico na simulação, resumido no contexto — que permite as duas coisas ao mesmo tempo. Ver `B-030` e `R-037`.

## Workflow de teste

1. Identifique o comportamento estranho (ex.: agente muito passivo).
2. Localize o prompt no `prompt_registry.yaml` (ex.: `agent.thought.base_high`).
3. Edite o `.md` correspondente — ajuste tom, exemplos, restrições.
4. Reinicie a simulação ou use **hot-reload** (se implementado).
5. Compare logs antes/depois no painel Debug.

## Hot-reload (implementar na Fase 4)

```csharp
// Pseudocódigo
PromptLoader.ReloadIfChanged(); // watch filesystem
var prompt = PromptLoader.Get("agent.thought.base_high", variables);
```

## Convenções

- **Idioma diegético:** português (BR) em toda narrativa e fala de agentes.
- **JSON:** respostas estruturadas sempre em JSON válido, sem markdown fence.
- **Atemporalidade:** memórias e opiniões nunca usam "ontem", "recentemente".
- **GM permissivo:** preferir `executed` / `partial` / `reinterpreted` sobre `denied`.
