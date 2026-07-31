# memory.seasonal_summary

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `memory.seasonal_summary` |
| **Tier** | `longform` |
| **Schema** | `memory_summary_response` |
| **Quando usar** | A cada ~15 dias in-game |

## Variáveis

- `{{agentName}}`
- `{{dailyMemoriesBlock}}`
- `{{preservedMarcantes}}`
- `{{personality}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Comprima ~15 dias de memórias diárias em um resumo de médio prazo (1-2 parágrafos). Atemporal. Preserve arcos (relações, projetos, conflitos). Marcantes intactos referenciados.

---

## User Template

Agente: {{agentName}}
Personalidade: {{personality}}
Marcantes a preservar: {{preservedMarcantes}}

Memórias diárias:
{{dailyMemoriesBlock}}

Retorne JSON schema `memory_summary_response`.

---

## Notas de teste

- Resumos que perdem conflitos → reforçar preservação de arcos no System.
