# cognition.dissonance_classifier

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `cognition.dissonance_classifier` |
| **Tier** | `utility` |
| **Schema** | `dissonance_classification_response` |
| **Prioridade** | P0 — bloqueador |
| **Origem** | PDF §3.2, passos 1 e 2 |
| **Quando usar** | Após conversa (opiniões sociais, a quente) e no lote noturno (opiniões gerais) |

## Por que este prompt é crítico

É o único ponto do sistema que decide se uma experiência **contradiz** ou **reforça** uma crença. Sem ele, o buffer de dissonância nunca enche, a ruptura (`cognition.opinion_burst`) nunca dispara, e a reavaliação reativa de metas (`cognition.goal_reactive`) nunca acontece.

## Regra de custo

Processa **todas** as impressões contra **todas** as opiniões em **uma única chamada**. Classificar par a par multiplicaria o custo por N×M. Este é o prompt de maior volume do sistema — mantê-lo curto e barato é requisito, não otimização.

## Variáveis

- `{{agent_context}}` — identidade e personalidade resumidas (não mandar memórias, não é necessário aqui)
- `{{existing_opinions}}` — lista de opiniões com `id`, `target`, `nuance_description`
- `{{new_impressions}}` — lista de impressões brutas com `id` e texto

---

## System

{{include:_shared/system_rules.md}}

Você compara experiências novas com crenças existentes de uma pessoa e classifica a relação entre elas.

Para cada par (impressão, opinião) que tiver relação relevante, classifique como:

- **conflito** — a experiência contradiz a crença
- **sinergia** — a experiência confirma a crença

Regras:

1. **Só reporte pares com relação real.** A maioria dos pares não tem relação nenhuma. Omita esses. Uma impressão pode não gerar nenhuma classificação.
2. **Uma impressão pode afetar várias opiniões.** Exemplo: "passei fome porque o estoque acabou" gera conflito tanto na opinião sobre a liderança quanto na opinião sobre a eficiência da comunidade.
3. **Viés de confirmação.** Se a personalidade for teimosa ou dogmática, prefira interpretar casos ambíguos como sinergia. Se for flexível ou curiosa, prefira conflito. É assim que a dissonância cognitiva é simulada.
4. **Intensidade** de 1 a 3: 1 é evidência fraca, 3 é evidência frontal e inegável.
5. Não escreva justificativa longa. No máximo uma oração curta por par.

---

## User Template

### Pessoa
{{agent_context}}

### Crenças atuais
{{existing_opinions}}

### Experiências novas
{{new_impressions}}

---

Retorne apenas JSON:

```json
{
  "classifications": [
    {
      "impression_id": "imp_02",
      "opinion_id": "op_bob",
      "relation": "conflito",
      "intensity": 3,
      "reason": "Admitiu esconder comida, o que contradiz a crenca de que Bob e generoso."
    }
  ]
}
```

Se nenhuma experiência tiver relação com nenhuma crença, retorne `{"classifications": []}`.

---

## Notas de teste

- **Excesso de classificações** é o modo de falha mais comum em modelos fracos: eles tentam relacionar tudo com tudo. Se acontecer, reforce a regra 1 com um exemplo negativo explícito no System.
- **Nenhuma classificação nunca** indica o oposto: as opiniões estão genéricas demais ou as impressões vagas demais. Verifique a saída de `social.post_conversation`.
- O viés de confirmação (regra 3) é o coração da dissonância cognitiva pedida no PDF. Teste com dois agentes de teimosia oposta recebendo a mesma impressão — devem classificar diferente.
- `intensity` alimenta quantas entradas vão para o buffer. Considere somar a intensidade em vez de contar entradas, para que uma evidência frontal pese mais que três fracas.
- Tier `utility` de propósito: precisa ser o modelo mais barato que ainda acerte. Registrar aqui o modelo mais fraco validado.

**min_tier_testado:** _(preencher no primeiro playtest)_
