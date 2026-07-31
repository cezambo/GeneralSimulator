# cognition.goal_revise

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.goal_revise` |
| **Tier** | `narrative` |
| **Schema** | `goal_revise_response` |
| **Quando usar** | Revisão de meta em qualquer nível — diária, sazonal, anual ou reativa |

## Variáveis

- `{{agentContext}}` — identidade, corpo, personalidade, opiniões
- `{{goalLevel}}` — `primary` | `secondary` | `tertiary` | `whim`
- `{{triggerKind}}` — `scheduled` | `reactive` | `post_burst` | `capacity_loss`
- `{{currentGoals}}` — metas ativas nos níveis relevantes
- `{{triggerEvent}}` — evento que provocou a revisão (se reativo)
- `{{memoriesBlock}}` — memórias do período coberto
- `{{communityState}}` — metas e leis comunitárias (se aplicável)
- `{{deprecatedGoal}}` — meta abandonada recentemente, para contexto

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Revise a meta solicitada para esta pessoa. Metas são verbos mais objetos concretos — nada vago.

**Nível `tertiary`:** foco do dia, definido ao acordar.
**Nível `secondary`:** foco da estação (~15 dias).
**Nível `primary`:** ambição de vida; muda raramente.
**Gatilho reativo:** trauma, ruptura de opinião ou perda de capacidade invalidam metas inferiores.

Se a mudança invalidar metas de nível abaixo, liste-as em `alsoRevise`.

---

## User Template

### Agente
{{agentContext}}

### Nível a revisar
{{goalLevel}}

### Gatilho
{{triggerKind}}
{{triggerEvent}}

### Metas atuais
{{currentGoals}}

### Meta depreciada
{{deprecatedGoal}}

### Memórias relevantes
{{memoriesBlock}}

### Comunidade
{{communityState}}

---

Retorne JSON schema `goal_revise_response`.
