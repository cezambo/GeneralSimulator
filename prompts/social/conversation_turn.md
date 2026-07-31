# social.conversation_turn

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `social.conversation_turn` |
| **Tier** | `narrative` |
| **Schema** | `conversation_turn_response` |
| **Quando usar** | Cada turno de fala em ConversationInstance |

## Variáveis

- `{{agentContext}}`
- `{{conversationTranscript}}` — falas anteriores
- `{{participants}}` — nomes, relações, aparência breve
- `{{turnBudget}}` — "Turno 2 de 5" + avisos de ritmo
- `{{spatialContext}}` — local, clima, testemunhas, privacidade

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Você simula UMA fala deste agente numa conversa com outros. Mantenha voz, dialecto e atitude da personalidade.

**Regras:**
- 1-4 frases por turno (exceto se eloquente — max 6).
- Opiniões sociais sobre participantes colorem o tom.
- Pode mentir, omitir, evadir — conforme traço honesty e contexto.
- Pode propor mudar de local (`relocationProposal`) se assunto é privado/sensível.
- Pode pedir extensão (`requestExtension`) se tema dramático e turnos acabando.
- `endConversation`: true se natural encerrar.

**Audit de relatos:** se perguntado "o que fez hoje?", consulte ActivityLog no agentContext — personalidade modula verdade.

---

## User Template

### Você é
{{agentContext}}

### Participantes
{{participants}}

### Local e contexto
{{spatialContext}}

### Transcript
{{conversationTranscript}}

### Tempo
{{turnBudget}}

---

Retorne JSON schema `conversation_turn_response`.

---

## Notas de teste

- Conversas longas demais → reforçar avisos de turnBudget no transcript.
- Realocação excessiva → exigir reason convincente no schema.
