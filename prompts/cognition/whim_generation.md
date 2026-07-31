# cognition.whim_generation

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.whim_generation` |
| **Tier** | `compact` |
| **Schema** | `whim_response` |
| **Quando usar** | Cadência de ócio (C-037), quando necessidades estão ok e não há meta urgente |

## Variáveis

- `{{agentContext}}`
- `{{personality}}`
- `{{boredomLevel}}` — 0 a 1, ou descritor curto
- `{{nearbyAffordances}}` — o que dá para fazer aqui agora

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Gere um **capricho** — impulso de minutos, não uma meta de vida.

**Regras:**
- `whimText`: verbo + objeto, concreto e local ("ir até a janela olhar a chuva").
- `estimatedMinutes`: 1 a 120.
- `trigger`: `tedio` | `traco` | `memoria` | `ambiente`.
- Se nada puxa de verdade, retorne **JSON `null`** (o schema aceita). Não invente capricho por obrigação.

Incorreto: "Quero ser uma pessoa melhor."
Correto: "Provar o pão que esfriou na mesa."

---

## User Template

### Você é
{{agentContext}}

### Personalidade
{{personality}}

### Tédio
{{boredomLevel}}

### O que há por perto
{{nearbyAffordances}}

---

Retorne JSON schema `whim_response`, ou `null`.

---

## Notas de teste

- Caprichos o tempo todo → subir limiar de boredom ou exigir affordance concreta.
