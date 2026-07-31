# generation.scenario_to_terrain

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.scenario_to_terrain` |
| **Tier** | `compact` |
| **Schema** | `terrain_params_response` |
| **Quando usar** | Pré-jogo — usuário descreveu cenário |

## Variáveis

- `{{userScenario}}` — texto livre do usuário (pode ser vazio)
- `{{numAgents}}` — quantas pessoas
- `{{mapSizeDefault}}` — ex.: 64

---

## System

{{include:_shared/rules_universal.md}}

Você interpreta a descrição de cenário de um simulador de vida social e produz parâmetros técnicos para geração procedural de terreno.

Se cenário vazio, gere vila temperada equilibrada para {{numAgents}} pessoas.

**Coerência:** parâmetros devem refletir a narrativa (vila costeira → waterStyle: costa, waterRatio alto).

---

## User Template

Cenário descrito pelo usuário:
"""
{{userScenario}}
"""

Número de agentes: {{numAgents}}
Tamanho padrão do mapa: {{mapSizeDefault}}x{{mapSizeDefault}}

Retorne JSON schema `terrain_params_response`. Inclua `scenarioNarrative`: 2-3 frases expandindo a premissa para downstream.

---

## Notas de teste

- Cenários absurdos → ainda produzir params válidos, narrative explica adaptação.
- mapSize: escalar levemente com numAgents.
