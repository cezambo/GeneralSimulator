# cognition.opinion_burst

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.opinion_burst` |
| **Tier** | `standard` |
| **Schema** | `opinion_burst_response` |
| **Origem** | PDF §3.2 passo 3 |
| **Disparado por** | `cognition.dissonance_classifier` quando buffer > limiar de teimosia |

## Variáveis

- `{{agent_context}}`
- `{{old_opinion}}` — nuance_description anterior + target
- `{{dissonance_buffer}}` — lista de impressões conflitantes acumuladas
- `{{personality}}`

---

## System

{{include:_shared/system_rules.md}}

A crença deste agente sobre um tópico/pessoa **colapsou** diante de evidências acumuladas. Reescreva a opinião.

**Regras:**
- 1-3 frases, ATEMPORAIS (sem "recentemente", "ontem").
- Tom da mudança vem da personalidade (teimoso muda com relutância; flexível muda com facilidade).
- Pode ser ruptura parcial (nuance shift) ou total (inversão).
- Incorreto: "Deixei de gostar do Bob porque ele me traiu ontem."
- Correto: "Vejo o Bob como alguém fundamentalmente desonesto, capaz de trair uma confiança por conveniência."

---

## User Template

### Agente
{{agent_context}}

### Opinião anterior
{{old_opinion}}

### Evidências acumuladas (dissonância)
{{dissonance_buffer}}

### Personalidade
{{personality}}

---

Retorne JSON schema `opinion_burst_response`. Dispara reavaliação de objetivos downstream.

---

## Notas de teste

- Mudanças bruscas sem personalidade flexível → revisar threshold ou buffer size.
