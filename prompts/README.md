# Biblioteca de Prompts — Simulador de Interações

Todos os prompts do projeto vivem aqui como arquivos Markdown editáveis. **Não estão hardcoded no código.**

## Como funciona

1. **`prompt_registry.yaml`** — índice central: mapeia ID → arquivo → variáveis → **tier** (`compact` | `narrative` | `longform`).

   Prompt **não** declara modelo. O binding tier → modelo/provedor vive em `config/models.json`. Ver `docs/03-CAMADA-LLM.md`.

2. **Regras compartilhadas** — injetadas por include:
   - `_shared/rules_universal.md` — JSON, idioma, concisão (todos)
   - `_shared/rules_agent.md` — persona, agência, atemporalidade (agente)
   - `_shared/rules_gm.md` — permissivo, mutar não bloquear (Validador)

3. **`prompts/**/*.md`** — templates com blocos `## System` e `## User Template`.

4. **Runtime** — engine carrega YAML, lê `.md`, substitui `{{variáveis}}` em camelCase, envia ao provedor.

## Pipeline colapsado (31/07/2026)

- **Sem** `thought_router` nem `action_intent` — pensamento emite `decision` direto.
- **Profundidade:** consciência (B-014) escolhe `base_low` vs `base_high`; `requestedDeepThinking` escala para `reasoning`.
- **Validador único:** `gm.evaluate_high`. Affordance resolvida na engine → zero LLM.
- **Metas:** `cognition.goal_revise` unifica daily/seasonal/annual/reactive.
- **Combate:** sem prompts dedicados — grito como fato perceptível + viés de relação (A-029).

## Estrutura de pastas

```
prompts/
├── prompt_registry.yaml
├── README.md
├── _shared/
│   ├── rules_universal.md
│   ├── rules_agent.md
│   └── rules_gm.md
├── generation/
├── agent/
├── memory/
├── cognition/
├── social/
├── community/
└── gm/
```

## Variáveis comuns (camelCase)

| Variável | Conteúdo |
|----------|----------|
| `{{agentContext}}` | Identidade, corpo, personalidade, memórias, opiniões, objetivos, inventário |
| `{{affordances}}` | Lista do que o agente pode fazer agora (engine) |
| `{{worldSnapshot}}` | Tiles, objetos e agentes num raio relevante |
| `{{userInstructions}}` | Instruções ativas do usuário ao Validador |
| `{{triggerType}}` | reactive / idle / scheduled / postInteraction / postDenial |

### Estado do corpo e do mundo entra como prosa

A simulação por baixo é detalhada. **Nada disso vai cru para o prompt.** O que entra é descrição curta e saliente. Ver `B-030` e `R-037`.

## Validação

```bash
node scripts/validate-contracts.mjs
```

Verifica: arquivos existem, schemas referenciados, includes válidos, variáveis camelCase no registry.

## Convenções

- **Idioma diegético:** português (BR) em narrativa e fala.
- **JSON:** camelCase, sem markdown fence.
- **Atemporalidade:** memórias e opiniões sem marcadores temporais relativos.
- **Validador permissivo:** preferir `executed` / `partial` / `reinterpreted` sobre `denied`.
