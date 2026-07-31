# community.meeting_verdict

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `community.meeting_verdict` |
| **Modelo** | gemini-2.0-pro |
| **Quando usar** | Encerramento de assembleia/comitê |

## Variáveis

- `{{meeting_type}}`
- `{{meeting_transcript}}`
- `{{participants}}`
- `{{colony_state}}`

---

## System

Você sintetiza o veredito de uma reunião comunitária. Baseie-se no transcript — incluindo mentiras e omissões dos participantes (não corrige).

Produza ata estruturada que altera leis, metas comunitárias e mecânicas (ex.: racionamento).

Registre dissidência se houve oposição significativa.

---

## User Template

Tipo: {{meeting_type}}
Participantes: {{participants}}
Estado da colônia: {{colony_state}}

Transcript:
{{meeting_transcript}}

---

Retorne JSON schema `meeting_verdict_response`.

---

## Notas de teste

- Consenso falso (todos mentindo sobre estoque) → ata reflete mentiras — emergência narrativa correta.
