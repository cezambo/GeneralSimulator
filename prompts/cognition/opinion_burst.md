# cognition.opinion_burst

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.opinion_burst` |
| **Tier** | `narrative` |
| **Schema** | `opinion_burst_response` |
| **Disparado por** | a classificação de dissonância (`C-025`, dentro de `social.post_conversation` ou de `cognition.nightly_appraisal`) quando buffer > limiar de teimosia |

## Variáveis

- `{{agentContext}}`
- `{{oldOpinion}}` — nuanceDescription anterior + target + stance
- `{{dissonanceBuffer}}` — impressões conflitantes acumuladas
- `{{personality}}`

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

A crença deste agente sobre um tópico/pessoa **colapsou** diante de evidências acumuladas. Reescreva a opinião.

**Regras:**
- 1-3 frases ATEMPORAIS (sem "recentemente", "ontem").
- Tom da mudança vem da personalidade.
- Preencha `stance` (trust/distrust/admire/pity/resent/indifferent/fear/desire/neutral) — compressão para pré-filtro downstream.
- Preencha `topic` quando o alvo for claro.
- Pode ser ruptura parcial (`nuance_shift`) ou total (`inversao`).
- Incorreto: "Deixei de gostar do Bob porque ele me traiu ontem."
- Correto: "Vejo o Bob como alguém fundamentalmente desonesto, capaz de trair uma confiança por conveniência."

---

## User Template

### Agente
{{agentContext}}

### Opinião anterior
{{oldOpinion}}

### Evidências acumuladas (dissonância)
{{dissonanceBuffer}}

### Personalidade
{{personality}}

---

Retorne JSON schema `opinion_burst_response`. Dispara `cognition.goal_revise` downstream.

---

## Notas de teste

- Mudanças bruscas sem personalidade flexível → revisar threshold ou buffer size.
