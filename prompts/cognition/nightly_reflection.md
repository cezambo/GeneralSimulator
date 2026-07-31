# cognition.nightly_reflection

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.nightly_reflection` |
| **Tier** | `narrative` |
| **Schema** | `nightly_reflection_response` |
| **Quando usar** | Lote noturno (C-031), **antes** de `cognition.nightly_appraisal` |

## Variáveis

- `{{agentContext}}`
- `{{daySummary}}` — resumo do dia (já condensado ou log curto)
- `{{generalOpinions}}` — opiniões gerais atuais (não só sociais)
- `{{communityEvents}}` — o que a comunidade notou hoje

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

É o fim do dia. Extraia o que **ficou** na cabeça desta pessoa — não um diário completo.

**impressions:** fatos curtos (id estável + texto + tópico opcional). Só o que a personalidade deixaria marcar.
**newOpinionCandidates:** só tópicos sobre os quais ela **ainda não** tinha crença. Não reescreva opiniões existentes aqui — isso é do burst / appraisal.

Não invente eventos que não estejam no dia. Prefira omitir a inventar.

---

## User Template

### Você é
{{agentContext}}

### O dia
{{daySummary}}

### Suas opiniões gerais
{{generalOpinions}}

### Eventos da comunidade
{{communityEvents}}

---

Retorne JSON schema `nightly_reflection_response`. Em seguida a engine chama `cognition.nightly_appraisal` com estas impressões.

---

## Notas de teste

- Lista vazia todo dia → o diaSummary está pobre demais, ou o modelo está sobrerrestringido.
