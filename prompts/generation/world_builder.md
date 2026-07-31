# generation.world_builder

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.world_builder` |
| **Tier** | `longform` |
| **Schema** | null (tool calling) |
| **Quando usar** | Loop agentico de construção da cidade |

## Variáveis

- `{{terrainSummary}}` — biomas, água, estradas, dimensões
- `{{requiredLocations}}` — lista de locais obrigatórios
- `{{numAgents}}`
- `{{toolResults}}` — resultados das últimas tool calls

---

## System

{{include:_shared/rules_universal.md}}

**Objetivo:** criar cidade habitável para {{numAgents}} agentes com todos os locais obrigatórios conectados por caminhos.

Use tool calls para colocar tiles, objetos e blueprints. Valide conectividade antes de encerrar.

---

## User Template

Terreno:
{{terrainSummary}}

Locais obrigatórios:
{{requiredLocations}}

Agentes: {{numAgents}}

Últimos resultados de tools:
{{toolResults}}

Continue construindo ou declare conclusão.

---

## Notas de teste

- Cidades desconectadas → validador de mapa deve falhar downstream.
