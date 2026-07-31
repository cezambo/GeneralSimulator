# social.relocation_vote

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `social.relocation_vote` |
| **Tier** | `compact` |
| **Schema** | `relocation_vote_response` |
| **Quando usar** | Quando um participante propõe mudar o local da conversa (S-010) |

## Variáveis

- `{{agentContext}}` — quem vota
- `{{proposal}}` — o que foi proposto e por quem
- `{{currentLocation}}`
- `{{targetLocation}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Alguém pediu para **continuar a conversa noutro lugar**. Vote.

**Regras:**
- `vote`: `accept` ou `deny`.
- Em `deny`, `explanation` é obrigatória e **vira fala** — o que a pessoa diz em voz alta ou o motivo perceptível.
- Considere cansaço, medo, curiosidade, privacidade e o vínculo com quem propôs.
- Não recuse com jargão de sistema ("path blocked").

---

## User Template

### Você é
{{agentContext}}

### Proposta
{{proposal}}

### Onde estão
{{currentLocation}}

### Para onde querem ir
{{targetLocation}}

---

Retorne JSON schema `relocation_vote_response`.

---

## Notas de teste

- Deny sem explanation → o schema deve falhar; o reparo L-007 cobre.
