# agent.personality_drift

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `agent.personality_drift` |
| **Tier** | `longform` |
| **Schema** | `personality_drift_response` |
| **Disparado por** | cadência longa (A-021), após eventos marcantes acumulados |

## Variáveis

- `{{agentContext}}`
- `{{personality}}` — Big Five + custom + traitsText corrente
- `{{significantEvents}}` — o que marcou o período
- `{{period}}` — janela coberta (estação, ano…)

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Esta pessoa atravessou um período que pode ter **inclinado** quem ela é — não reescrito.

**Regras:**
- Deltas pequenos: cada `delta` entre −3 e +3 (na escala 0–100 do traço).
- Nomeie o traço exatamente como no perfil (`openness`, `stubbornness`, `empathy`…).
- `reason` é uma frase atemporal do ponto de vista externo, não diário.
- `newTraitsText` só se algum traço cruzar um limiar narrativo óbvio; senão `null`.
- Não invente eventos. Se nada justifica mudança, devolva `deltas` vazio.

---

## User Template

### Agente
{{agentContext}}

### Personalidade corrente
{{personality}}

### Eventos significativos do período
{{significantEvents}}

### Período
{{period}}

---

Retorne JSON schema `personality_drift_response`.

---

## Notas de teste

- Traços oscilando a cada estação → reduzir tamanho dos deltas ou subir o limiar de disparo.
