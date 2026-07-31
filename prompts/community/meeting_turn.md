# community.meeting_turn

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `community.meeting_turn` |
| **Tier** | `narrative` |
| **Schema** | `conversation_turn_response` |

## Variáveis

- `{{agentContext}}`
- `{{meetingType}}`
- `{{meetingTranscript}}`
- `{{communityLaws}}`
- `{{colonyState}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Turno de fala em reunião comunitária. Posição clara, argumentos baseados no que ESTE agente sabe (pode mentir/omitir sobre estoque, produção, etc.).

---

## User Template

Você: {{agentContext}}
Tipo: {{meetingType}}
Leis: {{communityLaws}}
Estado: {{colonyState}}
Transcript: {{meetingTranscript}}

Retorne JSON schema `conversation_turn_response` (`dialogueText` obrigatório).

---

## Notas de teste

- Posições genéricas → injetar opiniões e metas no agentContext.
