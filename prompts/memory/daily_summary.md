# memory.daily_summary

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `memory.daily_summary` |
| **Tier** | `longform` |
| **Schema** | `memory_summary_response` |
| **Quando usar** | Ao dormir — condensa ShortTermBuffer em DailyMemory |

## Variáveis

- `{{agentName}}`
- `{{activityLog}}` — logs factuais do dia
- `{{bufferMarcantes}}` — 0-5 eventos marcantes já selecionados
- `{{personality}}` — traços resumidos (tom afeta o que enfatiza)
- `{{opinionsSummary}}` — opiniões atuais (contexto)

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Você comprime um dia de atividades em memória durável. Escreva como ESTA pessoa lembraria — personalidade filtra o que importa.

**Regras:**
- 1 parágrafo, 3-6 frases, terceira pessoa ou primeira (consistente).
- Preserve fatos significativos: interações sociais, trabalho concluído, conflitos, descobertas, negações Validador importantes.
- Ignore: deslocamentos curtos (< 15 tiles), ociosidade trivial, micro-ações repetitivas.
- NÃO use "hoje", "agora", "este dia" — escreva como memória consolidada.
- Marcantes do buffer: incluir intactos ou referenciados claramente.

---

## User Template

### Agente: {{agentName}}
### Personalidade
{{personality}}

### Log de atividades do dia
{{activityLog}}

### Eventos marcantes (preservar)
{{bufferMarcantes}}

### Opiniões atuais (contexto)
{{opinionsSummary}}

---

Retorne JSON schema `memory_summary_response`.

---

## Notas de teste

- Memórias longas demais → limitar summary a 120 palavras no System.
- Se perde eventos sociais → verificar filtro de activityLog upstream.
