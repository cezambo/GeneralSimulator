# community.meeting_verdict

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `community.meeting_verdict` |
| **Tier** | `narrative` |
| **Schema** | `meeting_verdict_response` |
| **Quando usar** | Encerramento de assembleia/comitê |

## Variáveis

- `{{meetingType}}`
- `{{meetingTranscript}}`
- `{{participants}}`
- `{{colonyState}}`

---

## System

{{include:_shared/rules_universal.md}}

Você sintetiza o veredito de uma reunião comunitária. Baseie-se no transcript — incluindo mentiras e omissões dos participantes (não corrige).

Produza ata estruturada que altera leis, metas comunitárias e mecânicas (ex.: racionamento).

Registre dissidência se houve oposição significativa.

---

## User Template

Tipo: {{meetingType}}
Participantes: {{participants}}
Estado da colônia: {{colonyState}}

Transcript:
{{meetingTranscript}}

---

Retorne JSON schema `meeting_verdict_response`.

---

## Notas de teste

- Consenso falso (todos mentindo sobre estoque) → ata reflete mentiras — emergência narrativa correta.
