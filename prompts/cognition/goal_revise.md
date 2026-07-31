# cognition.goal_revise

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.goal_revise` |
| **Tier** | `narrative` |
| **Schema** | `goal_revise_response` |
| **Prioridade** | P0 — bloqueador |
| **Quando usar** | Revisão de meta em qualquer nível e por qualquer gatilho |

## Por que é um prompt só

`C-040` a `C-044` são cinco situações — acordar, virar estação, virar ano, sofrer ruptura, perder capacidade — e todas fazem a mesma coisa: olhar o estado atual e decidir para onde a pessoa aponta agora. Cinco prompts seriam cinco lugares para a mesma regra divergir. O que muda entre eles é o **nível** e o **gatilho**, e os dois são entrada.

O caso que roda todo dia é `tertiary` com gatilho `scheduled`, ao acordar (`C-041`), e é o que torna este prompt P0: sem ele o agente acorda no dia 2 sem ter o que fazer.

## Variáveis

- `{{agentContext}}` — identidade, corpo, personalidade, opiniões
- `{{goalLevel}}` — `primary` | `secondary` | `tertiary` | `whim`
- `{{triggerKind}}` — `scheduled` | `reactive` | `post_burst` | `capacity_loss`
- `{{currentGoals}}` — metas ativas nos níveis relevantes
- `{{triggerEvent}}` — evento que provocou a revisão, quando reativo
- `{{memoriesBlock}}` — memórias do período coberto
- `{{communityState}}` — metas e leis comunitárias, quando aplicável
- `{{deprecatedGoal}}` — meta abandonada recentemente, para contexto

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Decida para onde esta pessoa aponta agora, no nível pedido.

**Meta é verbo mais objeto concreto.** "Consertar o telhado antes da chuva" é meta. "Ser feliz", "melhorar de vida" e "cuidar da família" não são: não há como saber se foram cumpridas, e o agente que as recebe não tem o que fazer amanhã de manhã.

### O nível diz o horizonte

| Nível | Horizonte | O que cabe |
|---|---|---|
| `primary` | A vida | Ambição de fundo. Muda raramente, e mudar é acontecimento |
| `secondary` | A estação | Projeto com etapas, que sustenta a primária |
| `tertiary` | O dia | O que dá para fazer entre acordar e dormir, e que avança a secundária |
| `whim` | Minutos | Vontade passageira, que não precisa servir a nada |

Uma meta terciária que não cabe num dia é um erro de nível. Uma meta primária que se resolve numa tarde também.

### O gatilho diz o quanto mexer

**`scheduled`** — revisão de rotina. Continuidade é a resposta normal: se a meta de ontem não foi cumprida e continua fazendo sentido, ela continua. Trocar de meta todo dia é um agente que nunca termina nada.

**`reactive`** — algo aconteceu que não dá para ignorar. Aqui a mudança é esperada, e `triggerEvent` é o que a justifica.

**`post_burst`** — a pessoa acabou de mudar de opinião sobre algo (`C-029`). Metas que existiam por causa da crença antiga podem ter perdido o sentido, e é isso que se está conferindo.

**`capacity_loss`** — o corpo dela não faz mais o que a meta exigia (`B-031`). A meta não é impossível de querer, é impossível de executar, e é diferente. O ferreiro que perdeu a mão não deixa de amar a forja: ele precisa descobrir o que fazer com isso, e a resposta pode ser ensinar, pode ser adaptar, pode ser recusar-se a aceitar e tentar mesmo assim. Não force resignação.

### Consequências para baixo

Se a nova meta invalidar metas de nível inferior, liste esses níveis em `alsoRevise`. Mudar a secundária costuma invalidar a terciária; mudar a primária costuma invalidar as duas.

Em `rationale`, escreva o raciocínio **dela**, não a análise de fora. E se houver `deprecatedGoal`, `deprecatedReason` explica por que aquilo ficou para trás — é o que depois aparece na leitura da vida dessa pessoa.

Personalidade manda. Teimoso insiste na meta que fracassou. Ansioso troca cedo demais. Ambicioso escolhe grande demais para o horizonte.

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

---

## Notas de teste

- **Troca gratuita em `scheduled`** é o modo de falha mais comum: o modelo trata revisar como obrigação de mudar. Se aparecer, reforçar continuidade com exemplo.
- **Meta vaga** é o segundo. O teste é perguntar se dá para saber, ao anoitecer, se foi cumprida.
- **Nível errado**: terciária que leva semanas, primária que acaba numa tarde.
- Rodar duas vezes o mesmo agente com personalidades trocadas: o teimoso e o ansioso não podem produzir a mesma revisão diante do mesmo fracasso.
- Em `capacity_loss`, verificar que a resignação não é a única saída oferecida.

**minTierTestado:** _(preencher no primeiro playtest)_
