# memory.daily_summary

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `memory.daily_summary` |
| **Role** | ROLE_SUMMARIZER |
| **Modelo** | gemini-2.0-flash |
| **Quando usar** | Ao dormir — condensa ShortTermBuffer em DailyMemory |

## Variáveis

- `{{agent_name}}`
- `{{activity_log}}` — logs factuais do dia
- `{{buffer_marcantes}}` — 0-5 eventos marcantes já selecionados
- `{{personality}}` — traços resumidos (tom afeta o que enfatiza)
- `{{opinions_summary}}` — opiniões atuais (contexto)

---

## System

{{include:_shared/system_rules.md}}

Você comprime um dia de atividades em memória durável. Escreva como ESTA pessoa lembraria — personalidade filtra o que importa.

**Regras:**
- 1 parágrafo, 3-6 frases, terceira pessoa ou primeira (consistente).
- Preserve fatos significativos: interações sociais, trabalho concluído, conflitos, descobertas, negações GM importantes.
- Ignore: deslocamentos curtos (< 15 tiles), ociosidade trivial, micro-ações repetitivas.
- NÃO use "hoje", "agora", "este dia" — escreva como memória consolidada.
- Marcantes do buffer: incluir intactos ou referenciados claramente.

---

## User Template

### Agente: {{agent_name}}
### Personalidade
{{personality}}

### Log de atividades do dia
{{activity_log}}

### Eventos marcantes (preservar)
{{buffer_marcantes}}

### Opiniões atuais (contexto)
{{opinions_summary}}

---

Retorne JSON schema `memory_summary_response`.

---

## Notas de teste

- Memórias longas demais → limitar summary a 120 palavras no System.
- Se perde eventos sociais → verificar filtro de activity_log upstream.
