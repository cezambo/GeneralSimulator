# Especificação

Requisitos atômicos, identificados e verificáveis. Cada um é uma unidade fechada de trabalho que pode ser entregue a um agente sem contexto adicional além dos documentos referenciados.

## Domínios

| Prefixo | Arquivo | Escopo |
|---------|---------|--------|
| `W-` | [SPEC-W-mundo.md](SPEC-W-mundo.md) | Grid, tiles, materiais, objetos, geração, tempo, espaço |
| `R-` | [SPEC-R-substrato.md](SPEC-R-substrato.md) | Reações, temperatura, líquidos, gases, coberturas, substâncias, campos perceptuais |
| `O-` | [SPEC-O-objetos.md](SPEC-O-objetos.md) | Peso, volume, empacotamento, composição, trânsito, carga, descrição, crença, funcionamento |
| `A-` | [SPEC-A-agente.md](SPEC-A-agente.md) | Entidade, percepção, movimento, inventário, habilidades, rotina |
| `B-` | [SPEC-B-corpo.md](SPEC-B-corpo.md) | Anatomia, condições, capacidades, lesão, doença, cuidado |
| `C-` | [SPEC-C-cognicao.md](SPEC-C-cognicao.md) | Pensamento, memória, opiniões, objetivos |
| `S-` | [SPEC-S-interacao.md](SPEC-S-interacao.md) | Conversa, comunidade, conflito |
| `V-` | [SPEC-V-validador.md](SPEC-V-validador.md) | Validador e mediação |
| `U-` | [SPEC-U-ui.md](SPEC-U-ui.md) | Interface |
| `L-` | [SPEC-L-llm.md](SPEC-L-llm.md) | Camada LLM |
| `X-` | [SPEC-X-transversal.md](SPEC-X-transversal.md) | Persistência, testes, observabilidade, performance |

## Faixas aposentadas

Quando um bloco de requisitos cresce a ponto de merecer documento próprio, ele migra e **os identificadores antigos ficam aposentados**, nunca reciclados. Lacunas na numeração são normais e preferíveis a referências ambíguas.

| Faixa | Migrou para |
|-------|-------------|
| `W-015` a `W-028` | `R-001` a `R-050` — [SPEC-R-substrato.md](SPEC-R-substrato.md) |
| `A-012` a `A-019` | `B-001` a `B-063` — [SPEC-B-corpo.md](SPEC-B-corpo.md) |

## Formato

```
### W-003 — Tipos de tile
`P0` · `V1` · PDF 108-113 · dep: W-001 · prompt: —

Descrição do que precisa existir.

**Aceite:** condição objetivamente verificável.
```

**Prioridade** — `P0` bloqueia outros requisitos ou é essencial ao MVP. `P1` é núcleo do produto. `P2` é enriquecimento.

**Fatia** — `V0` a `V7`, conforme [04-ROADMAP.md](../04-ROADMAP.md).

**Origem** — `PDF <linhas>` quando vem do documento original; `derivado` quando é sub-necessidade que o documento implicava mas não declarava; `decisão` quando vem de escolha de projeto registrada em ADR ou revisão.

A marcação `derivado` é deliberadamente visível: ela mostra exatamente onde a expansão dos requisitos aconteceu e permite auditar se a expansão foi legítima.

**Aceite** — precisa ser verificável sem julgamento subjetivo, exceto onde a natureza do requisito é narrativa, e nesse caso o critério diz explicitamente que é avaliação humana amostrada.

## Como usar para decompor trabalho

Um requisito `P0` sem dependências pendentes é uma tarefa pronta para ser atacada. A ordem natural é: filtrar pela fatia atual, ordenar por dependência, entregar um por vez com o critério de aceite como definição de pronto.
