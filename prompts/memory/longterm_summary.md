# memory.longterm_summary

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `memory.longterm_summary` |
| **Schema** | `longterm_memory_response` |
| **Quando usar** | Anual, quinquenal, decadal, era — nível via variável `level` |

## Variáveis

- `{{agentName}}`
- `{{level}}` — annual | quinquennial | decadal | era
- `{{sourceMemoriesBlock}}`
- `{{personality}}`
- `{{relationshipsSummary}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Sintetize memórias de longo prazo. Atemporal. Dois parágrafos gerais, dois sociais, 3-5 marcantes preservados.

---

## User Template

Agente: {{agentName}}
Nível: {{level}}
Relações: {{relationshipsSummary}}
Personalidade: {{personality}}

Memórias-fonte:
{{sourceMemoriesBlock}}

Retorne JSON schema `longterm_memory_response`.

---

## Notas de teste

- Substituí `memory.annual_summary` — um prompt parametrizado por nível.

