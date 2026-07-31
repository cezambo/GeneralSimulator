# social.post_conversation

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `social.post_conversation` |
| **Tier** | `narrative` |
| **Schema** | `post_conversation_response` |
| **Quando usar** | Ao encerrar ConversationInstance, por participante |

⚑ Esta é a **apreciação a quente**: tirar as impressões da conversa e classificá-las contra as opiniões de quem as teve, numa chamada só. Havia um `cognition.dissonance_classifier` chamado logo depois desta chamada, relendo as mesmas impressões contra as mesmas opiniões — mesmo material, dois renders, uma chamada por participante por conversa. É a mesma fusão que `cognition.nightly_appraisal` fez do lado noturno (`C-025`, `S-012`, `S-014`).

## Variáveis

- `{{agentContext}}`
- `{{conversationTranscript}}`
- `{{participants}}`
- `{{existingOpinions}}` — já pré-filtradas por `stance`/`topic` (`A-029`, `C-030`)
- `{{topicFilter}}` — tópicos em jogo nesta conversa

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Analise a conversa do ponto de vista deste agente, e faça **duas** coisas na mesma resposta.

**Primeiro, extraia o que ficou.**

**rawImpressions:** fatos curtos (máx. 1 linha cada). Personalidade filtra o que foi de fato ouvido contra o que foi interpretado.
**sentimentDeltas:** -10 a +10 por participante principal.

**Depois, classifique o que você acabou de extrair** contra as opiniões abaixo. Você está julgando o que *este* agente sentiu contra o que *este* agente já achava — não o que outra pessoa na mesa sentiu.

{{include:_shared/classification_block.md}}

---

## User Template

### Você é
{{agentContext}}

### Participantes
{{participants}}

### Transcript completo
{{conversationTranscript}}

### Suas opiniões relevantes
{{existingOpinions}}

### Tópicos em jogo
{{topicFilter}}

---

Retorne JSON schema `post_conversation_response`, com `rawImpressions`, `sentimentDeltas` e `classifications`.

---

## Notas de teste

- Impressões devem ser específicas, não "conversa agradável".
- Mentiras do interlocutor geram impressões falsas (agente acredita) — correto.
- As classificações têm de referenciar impressões desta mesma resposta: classificar algo que não foi extraído é sinal de que o modelo perdeu o fio entre as duas tarefas.
- Par sem relação é omitido. Resposta com `classifications` vazio é válida e comum numa conversa banal.
- É aqui que a fusão quebra primeiro num tier pequeno. Se as classificações começarem a ignorar as impressões próprias, o recuo está descrito em `C-025` e custa uma chamada por participante.
