# cognition.dissonance_classifier

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.dissonance_classifier` |
| **Tier** | `compact` |
| **Schema** | `dissonance_classification_response` |
| **Prioridade** | P0 — bloqueador |
| **Quando usar** | Após conversa (opiniões sociais, a quente) e no lote noturno (opiniões gerais) |

## Por que este prompt é crítico

É o único ponto do sistema que decide se uma experiência **contradiz** ou **reforça** uma crença. Sem ele, o buffer de dissonância nunca enche, a ruptura (`cognition.opinion_burst`) nunca dispara, e a reavaliação reativa de metas (`cognition.goal_revise`) nunca acontece.

## Regra de custo

Processa **todas** as impressões contra **todas** as opiniões em **uma única chamada**. Classificar par a par multiplicaria o custo por N×M. Use `topicFilter` quando o engine já souber o tópico relevante.

## Variáveis

- `{{agentContext}}` — identidade e personalidade resumidas (não mandar memórias)
- `{{existingOpinions}}` — lista com `id`, `target`, `nuanceDescription`, `stance` (pré-filtro)
- `{{newImpressions}}` — impressões brutas com `id` e texto
- `{{topicFilter}}` — tópico opcional para limitar pares (vazio = todos)

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Você compara experiências novas com crenças existentes de uma pessoa e classifica a relação entre elas.

Para cada par (impressão, opinião) que tiver relação relevante, classifique como:

- **conflito** — a experiência contradiz a crença
- **sinergia** — a experiência confirma a crença

Regras:

1. **Só reporte pares com relação real.** A maioria dos pares não tem relação nenhuma. Omita esses.
2. **Uma impressão pode afetar várias opiniões.**
3. **Viés de confirmação.** Teimosia alta → prefira sinergia em casos ambíguos. Flexibilidade alta → prefira conflito.
4. **Intensidade** de 1 a 3: 1 é evidência fraca, 3 é evidência frontal.
5. Justificativa curta — no máximo uma oração por par.

---

## User Template

### Pessoa
{{agentContext}}

### Crenças atuais
{{existingOpinions}}

### Experiências novas
{{newImpressions}}

### Filtro de tópico (opcional)
{{topicFilter}}

---

Retorne JSON schema `dissonance_classification_response`.

Se nenhuma experiência tiver relação com nenhuma crença, retorne `{"classifications": []}`.

---

## Notas de teste

- **Excesso de classificações** é o modo de falha mais comum em modelos fracos. Reforce a regra 1 com exemplo negativo.
- `intensity` alimenta quantas entradas vão para o buffer. Considere somar intensidade em vez de contar entradas.
- Tier `compact` de propósito: modelo mais barato que ainda acerte.

**minTierTestado:** _(preencher no primeiro playtest)_
