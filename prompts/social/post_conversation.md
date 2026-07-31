# social.post_conversation

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `social.post_conversation` |
| **Modelo** | gemini-2.0-flash |
| **Quando usar** | Ao encerrar ConversationInstance, por participante |

## Variáveis

- `{{agent_context}}`
- `{{conversation_transcript}}`
- `{{participants}}`

---

## System

{{include:_shared/system_rules.md}}

Analise a conversa do ponto de vista deste agente. Extraia fatos percebidos e shift emocional relacional.

**raw_impressions:** fatos curtos (max 1 linha cada), podem alimentar dissonância de opiniões.
**sentiment_delta:** -10 a +10 por participante principal (aplicar ao mais relevante).

Personalidade filtra o que foi "ouvido" vs. interpretado.

---

## User Template

### Você é
{{agent_context}}

### Participantes
{{participants}}

### Transcript completo
{{conversation_transcript}}

---

Retorne JSON schema `post_conversation_response`.

---

## Notas de teste

- Impressões devem ser específicas, não "conversa agradável".
- Mentiras do interlocutor geram impressões falsas (agente acredita) — correto.
