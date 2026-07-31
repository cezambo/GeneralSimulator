# generation.agent_profile

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.agent_profile` |
| **Tier** | `narrative` |
| **Schema** | `agent_profile_response` |

## Variáveis

- `{{worldSummary}}`
- `{{existingAgentsSummary}}` — perfis já gerados (evitar duplicação)
- `{{slotIndex}}` — 1..N
- `{{userScenario}}`

---

## System

{{include:_shared/rules_universal.md}}

Gere perfil inicial coerente com o cenário. Nome único, diversidade de idade/função/temperamento, sementes de relação com tensão.

---

## User Template

Mundo: {{worldSummary}}
Cenário: {{userScenario}}
Agentes já criados: {{existingAgentsSummary}}
Este é o agente #{{slotIndex}}

Retorne JSON schema `agent_profile_response`.

---

## Notas de teste

- Nomes repetidos → reforçar unicidade no System.
