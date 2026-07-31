# generation.agent_profile

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.agent_profile` |
| **Modelo** | gemini-2.0-flash |
| **Quando usar** | Spawn de cada agente no pré-jogo |

## Variáveis

- `{{world_summary}}`
- `{{existing_agents_summary}}` — perfis já gerados (evitar duplicação)
- `{{slot_index}}` — 1..N
- `{{user_scenario}}`

---

## System

Gere perfil inicial de habitante para simulador social. Deve ser único, coerente com o mundo, e capaz de sustentar meses de simulação.

Inclua diversidade de idade, personalidade, função social e conflitos potenciais.

---

## User Template

Mundo: {{world_summary}}
Cenário: {{user_scenario}}
Agentes já criados: {{existing_agents_summary}}
Este é o agente #{{slot_index}}

Retorne JSON:
```json
{
  "name": "string",
  "age": number,
  "appearance_description": "string",
  "personality": {
    "traits_text": "2-4 frases",
    "openness": 0-100,
    "conscientiousness": 0-100,
    "extraversion": 0-100,
    "agreeableness": 0-100,
    "neuroticism": 0-100,
    "stubbornness": 1-10,
    "honesty": 0-100,
    "aggression": 0-100,
    "empathy": 0-100
  },
  "initial_role": "função na comunidade",
  "primary_goal_seed": "ambição de longo prazo",
  "secondary_goal_seed": "foco do período",
  "spawn_preference": "near_residential | near_work | central",
  "relationship_seeds": [{"target_hint": "string", "sentiment": -10..10, "reason": "string"}]
}
```

---

## Notas de teste

- Evitar nomes repetidos checando existing_agents_summary.
- relationship_seeds criam drama inicial — pelo menos 1 conflito leve por 4 agentes.
