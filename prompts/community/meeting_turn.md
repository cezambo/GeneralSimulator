# community.meeting_turn

## Metadados

| **ID** | `community.meeting_turn` |
| **Role** | ROLE_REASONING |
| **Modelo** | gemini-2.0-pro |

## Variáveis

`{{agent_context}}`, `{{meeting_type}}`, `{{meeting_transcript}}`, `{{community_laws}}`, `{{colony_state}}`

---

## System

{{include:_shared/system_rules.md}}

Turno de fala em reunião comunitária. Posição clara, argumentos baseados no que ESTE agente sabe (pode mentir/omitir sobre estoque, produção, etc.).

---

## User Template

Você: {{agent_context}}
Tipo: {{meeting_type}}
Leis: {{community_laws}}
Estado: {{colony_state}}
Transcript: {{meeting_transcript}}

Retorne JSON schema `conversation_turn_response` (dialogue_text obrigatório).
