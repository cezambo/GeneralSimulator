# memory.seasonal_summary

## Metadados

| **ID** | `memory.seasonal_summary` |
| **Role** | ROLE_SUMMARIZER |
| **Modelo** | gemini-2.0-pro |
| **Quando usar** | A cada ~15 dias in-game |

## Variáveis

`{{agent_name}}`, `{{daily_memories_block}}`, `{{preserved_marcantes}}`, `{{personality}}`

---

## System

{{include:_shared/system_rules.md}}

Comprima ~15 dias de memórias diárias em um resumo de médio prazo (1-2 parágrafos). Atemporal. Preserve arcos (relações, projetos, conflitos). Marcantes intactos referenciados.

---

## User Template

Agente: {{agent_name}}
Personalidade: {{personality}}
Marcantes a preservar: {{preserved_marcantes}}

Memórias diárias:
{{daily_memories_block}}

Retorne JSON schema `memory_summary_response`.
