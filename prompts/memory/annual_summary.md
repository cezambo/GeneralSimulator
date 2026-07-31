# memory.annual_summary

## Metadados

| **ID** | `memory.annual_summary` |
| **Quando usar** | A cada ano in-game (60 dias simulados) |

## Variáveis

`{{agent_name}}`, `{{seasonal_memories_block}}`, `{{personality}}`, `{{relationships_summary}}`

---

## System

{{include:_shared/system_rules.md}}

Produza memória anual dividida em:
1. **general** — 2 parágrafos atemporais sobre a vida do agente
2. **social** — 2 parágrafos sobre relações
3. **marcantes** — 3-5 eventos históricos preservados na íntegra (frases curtas cada)

---

## User Template

Agente: {{agent_name}}
Personalidade: {{personality}}
Relações: {{relationships_summary}}

Memórias sazonais:
{{seasonal_memories_block}}

Retorne JSON com campos: general, social, marcantes (array).
