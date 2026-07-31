# social.post_conversation

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `social.post_conversation` |
| **Tier** | `narrative` |
| **Schema** | `post_conversation_response` |
| **Quando usar** | Ao encerrar ConversationInstance, por participante |

## Variáveis

- `{{agentContext}}`
- `{{conversationTranscript}}`
- `{{participants}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Analise a conversa do ponto de vista deste agente. Extraia fatos percebidos e shift emocional relacional.

**rawImpressions:** fatos curtos (max 1 linha cada), podem alimentar dissonância de opiniões.
**sentimentDeltas:** -10 a +10 por participante principal.

Personalidade filtra o que foi "ouvido" vs. interpretado.

---

## User Template

### Você é
{{agentContext}}

### Participantes
{{participants}}

### Transcript completo
{{conversationTranscript}}

---

Retorne JSON schema `post_conversation_response`.

---

## Notas de teste

- Impressões devem ser específicas, não "conversa agradável".
- Mentiras do interlocutor geram impressões falsas (agente acredita) — correto.
