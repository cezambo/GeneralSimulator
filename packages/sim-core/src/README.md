# sim-core/src

Mapa de módulos e a spec dona de cada um. Antes de escrever num módulo, leia a spec: os requisitos são atômicos e têm critério de aceite, e o código existe para satisfazê-los.

| Módulo | O que mora aqui | Spec dona |
|---|---|---|
| `types/` | **Gerado.** Tipos derivados dos schemas. Não editar à mão | [X-009](../../../docs/spec/SPEC-X-transversal.md) |
| `rng/` | Aleatoriedade semeada por fluxo nomeado | [X-004](../../../docs/spec/SPEC-X-transversal.md) |
| `config/` | Carregamento e validação dos `config/*.json` | [X-008](../../../docs/spec/SPEC-X-transversal.md) |
| `world/` | Grid, tiles, camadas Z, relógio, clima | [SPEC-W](../../../docs/spec/SPEC-W-mundo.md) |
| `substrate/` | Substrato reativo: etiquetas, estados, matriz, propagação | [SPEC-R](../../../docs/spec/SPEC-R-substrato.md) |
| `objects/` | Objetos volumétricos, compostos, inventário, Funcionamento | [SPEC-O](../../../docs/spec/SPEC-O-objetos.md) |
| `body/` | Árvore de partes, condições, capacidades derivadas | [SPEC-B](../../../docs/spec/SPEC-B-corpo.md) |
| `agent/` | Posição, movimento, percepção, montagem do relato | [SPEC-A](../../../docs/spec/SPEC-A-agente.md) |
| `cognition/` | Pensamento, memória, opiniões, metas, Crivo | [SPEC-C](../../../docs/spec/SPEC-C-cognicao.md) |
| `social/` | Conversa, turnos, payload pós-conversa | [SPEC-S](../../../docs/spec/SPEC-S-interacao.md) |
| `validator/` | O Validador: julgamento, mutação, promoção de regra | [SPEC-V](../../../docs/spec/SPEC-V-validador.md) |
| `llm/` | OpenRouter, tier→modelo, saída estruturada, cassetes, custo | [SPEC-L](../../../docs/spec/SPEC-L-llm.md) |
| `protocol/` | WebSocket com cliente e painéis | [X-007](../../../docs/spec/SPEC-X-transversal.md) |
| `cli/` | Entradas de linha de comando, incluindo o spike | [X-001](../../../docs/spec/SPEC-X-transversal.md) |

## Três regras que não se negociam

**Nada de renderização.** `tsconfig.base.json` omite a lib `dom` de propósito. Se algo aqui precisar de `window` ou `document`, o lugar é `panel-web` ou `client-godot`.

**Nada de número de comportamento em código.** Limiar, fator, faixa, cadência e orçamento vivem em `config/tuning.json` (`X-008`). Código implementa mecanismo; dado descreve comportamento. O verificador reclama de número solto até em prosa de prompt.

**Nada de tipo escrito à mão que já exista em schema.** `schemas/` é fonte única (`X-009`). Rode `npm run types` depois de mexer num schema; `npm run check` falha se o gerado estiver fora de sincronia.

## Aleatoriedade

Nunca `Math.random()`. Sempre um fluxo nomeado de `SeedRoot`, porque `X-004` exige que a mesma semente reproduza a partida — inclusive em replay de cassete.

```ts
const dado = seeds.stream('validador.consequencia');
if (dado.chance(0.3)) { /* ... */ }
```

O fluxo é nomeado, e não global, para que acrescentar um consumidor de dado num módulo não mova a sequência de todos os outros. Sem isso, qualquer mudança no substrato invalidaria toda partida gravada.
