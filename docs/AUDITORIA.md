# Auditoria do Estado do Projeto

**Data:** 31/07/2026 (atualizada pós-reconciliação)
**Escopo:** reconciliação pós-agentes paralelos — pipeline LLM, compressão de substrato/corpo, promoção generalizada.

---

## Resumo em uma frase

Reconciliação concluída: pipeline colapsado (2 chamadas/ação), contratos alinhados, compressão de representação especificada, promoção generalizada cross-domain. Prompts faltantes permanecem declarados como `status: falta` — implementação de runtime ainda não existe.

---

## Achados resolvidos (reconciliação 31/07/2026)

| # | Achado | Resolução |
|---|--------|-----------|
| 1 | `system_rules.md` apagado, 11 includes quebrados | Substituído por `rules_universal` + `rules_agent` + `rules_gm` |
| 2 | Registry referenciava `thought_router`, `action_intent`, `goal_*`, `combat.*`, `evaluate_low`, etc. | Removidos/unificados; `cognition.goal_revise` criado |
| 3 | 8 tiers vs decisão de colapsar | 3 tiers: `compact`, `narrative`, `longform` |
| 4 | snake_case em prompts vs camelCase no schema | Prompts de saída alinhados; variáveis do registry em camelCase |
| 5 | `thought_router_response`, `action_intent_response` órfãos | Removidos de `llm-io.schema.json` |
| 6 | R-005 vs R-049 (recalcular todo tick) | R-005/R-049: invalidação por emissor, não varredura global |
| 7 | `damage`/`fall` fora de R-015 em reações | Movidos para `injuryTriggers` em `reactions.example.json` |
| 8 | Odor como campo de difusão | R-036: `odorDescriptor` 1–5 palavras |
| 9 | `wear` separado de integridade | R-028 unificado; `wear` removido do schema |
| 10 | `bladder`/`comfort` sem consumidor claro | Fundidos em `energy` + condições (B-019) |
| 11 | `smell`/`eating` em body sem schema | Adicionados a `Capacities` como derivados |
| 12 | Promoção só substrato | R-046/B-045 estendidos; `generalization` no `gm_response` |
| 13 | Sem validador de contratos | `scripts/validate-contracts.mjs` criado |

---

## Achados em aberto

| # | Achado | Prioridade |
|---|--------|------------|
| 1 | 12 prompts declarados `status: falta` (arquivo não existe) | P1 — escrever junto da fatia |
| 2 | `cognition.dissonance_classifier` — bloqueador cognitivo | P0 |
| 3 | `memory.annual_summary.md` vs `memory.longterm_summary` no registry | P2 — migrar ou aposentar annual |
| 4 | JSON inline em `agent_profile`, `custom_item` | P2 — migrar para schema |
| 5 | Vazamento de inglês em `opinion_burst.md` | P2 |
| 6 | Código/runtime ainda não existe | — |

---

## Contagem pós-reconciliação

| Métrica | Antes | Depois |
|---------|-------|--------|
| Prompts no registry | 35 | 24 |
| Tiers | 8 | 3 |
| Schemas aposentados em llm-io | 0 | 6 |
| Includes quebrados | 11 | 0 |
| Referências a `system_rules` | 13 | 0 (exceto histórico deste doc) |

---

## Veredito

Especificação e contratos estão coerentes para implementação. Próximo passo: V0 (spike headless) com pipeline de 2 chamadas e validador rodando no CI.

Validação: `node scripts/validate-contracts.mjs`
