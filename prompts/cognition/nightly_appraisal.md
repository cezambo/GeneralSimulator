# cognition.nightly_appraisal

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.nightly_appraisal` |
| **Tier** | `compact`, com `narrative` de recuo |
| **Schema** | `nightly_appraisal_response` |
| **Prioridade** | P0 — bloqueador |
| **Quando usar** | Uma vez por agente por noite, no lote (`C-031`), logo após a reflexão |

## Por que este prompt é crítico

Ele fecha o dia. É onde o agente decide **em que acreditar** do que ouviu (o Crivo, `C-047`) e **o que aquilo faz com as crenças que já tinha** (a classificação de dissonância, `C-025`). Sem ele, o banco de fatos nunca enche, o buffer de dissonância nunca cruza o limiar, e a ruptura de opinião nunca acontece — o agente vive dias sem que nenhum deles o mude.

## Duas tarefas, uma chamada

As duas leem o mesmo material do dia contra o mesmo contexto pessoal. Mantê-las separadas custaria uma chamada por agente por noite só para renderizar esse contexto duas vezes.

⚑ É aqui que a fusão quebra primeiro num tier barato: duas tarefas estruturalmente distintas numa resposta é o que modelo pequeno erra primeiro (`L-019`). O sintoma é uma das duas listas vir vazia ou degenerada enquanto a outra sai bem. O recuo está em `C-047` e custa uma chamada por agente por noite — número conhecido, para que a decisão de recuar seja medida e não sentida.

## Variáveis

- `{{agentContext}}` — identidade e personalidade resumidas, sem memórias
- `{{existingOpinions}}` — com `id`, `target`, `nuanceDescription`, `stance`, já pré-filtradas por tópico (`C-030`)
- `{{newImpressions}}` — impressões do dia com `id` e texto, incluindo as que a reflexão acabou de produzir
- `{{heardClaims}}` — o que foi dito ao agente, **na fala original**, com quem disse
- `{{factBankSummary}}` — o que ele já tem por verdade, para detectar colisão
- `{{topicFilter}}` — tópicos em jogo

---

## System

{{include:_shared/rules_universal.md}}
{{include:_shared/rules_agent.md}}

Você está fechando o dia de uma pessoa. Faça **duas** coisas na mesma resposta.

### Primeira: o Crivo

Destrinche em temas tudo o que disseram a esta pessoa hoje, e julgue cada tema à luz de quem ela é e do que ela já sabe. Um tema é uma afirmação, numa frase.

Cada tema recebe um veredito:

- **verdadeiro** — ela acredita. Vai virar fato que ela carrega e sobre o qual age.
- **possível** — plausível, mas não o bastante para agir. Fica em suspenso esperando outra fonte dizer o mesmo.
- **desinteressante** — o tema não pegou. Ela ouviu e não guardou.
- **ignorado** — ela decidiu não acolher. Ouviu, entendeu, e recusou.
- **falso** — ela não acredita, e vai lembrar que lhe disseram isso.

Julgue **a fala como foi dita**, não um resumo dela. A frase original é o que carrega o tom, a hesitação e o exagero, e é sobre isso que se julga se alguém está sendo sincero.

Sobre `reason`: escreva por que **esta** pessoa, com esta memória e esta personalidade, reage assim. É o campo que depois explica por que ela não sabe de algo que lhe disseram na cara. Desinteressante e ignorado produzem o mesmo efeito no sistema — nada —, e é só o motivo que os distingue.

Uma pessoa crédula acredita em mais coisas. Uma desconfiada julga falso o que contraria o que já tinha. Quem já sabe algo contrário ao que ouviu tende a falso ou possível, não a verdadeiro.

### Segunda: a dissonância

{{include:_shared/classification_block.md}}

---

## User Template

### Pessoa
{{agentContext}}

### O que já tem por verdade
{{factBankSummary}}

### Crenças atuais
{{existingOpinions}}

### O que disseram a ela hoje, como foi dito
{{heardClaims}}

### Impressões do dia
{{newImpressions}}

### Tópicos em jogo
{{topicFilter}}

---

Retorne JSON schema `nightly_appraisal_response`, com `verdicts` e `classifications`.

Dia sem ninguém por perto rende `verdicts` vazio e é resposta válida. Dia sem nada que contrarie ou confirme crença rende `classifications` vazio e também é válido. Os dois vazios ao mesmo tempo é sinal de que o material não chegou.

---

## Notas de teste

- **Uma lista boa e a outra degenerada** é o modo de falha da fusão. Se aparecer, o recuo é separar em duas chamadas (`C-047`).
- **Excesso de classificações** é o modo de falha da segunda tarefa isolada, e vem de esquecer que a maioria dos pares não tem relação nenhuma.
- **Tudo verdadeiro** é o modo de falha do Crivo, e costuma significar que a personalidade não está chegando no contexto.
- Um tema julgado possível não pode aparecer como verdade em lugar nenhum: quem promove é a corroboração (`C-049`), sem chamada.
- Testar com um mentiroso convincente e um sincero implausível na mesma noite. Se a pessoa acreditar no primeiro e duvidar do segundo, o prompt está fazendo o que deve — e é essa confusão que produz o agente que caminha três dias até um poço seco.

**minTierTestado:** _(preencher no primeiro playtest)_
