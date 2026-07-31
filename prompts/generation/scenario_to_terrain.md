# generation.scenario_to_terrain

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.scenario_to_terrain` |
| **Modelo** | gemini-2.0-flash |
| **Quando usar** | Pré-jogo — usuário descreveu cenário |

## Variáveis

- `{{user_scenario}}` — texto livre do usuário (pode ser vazio)
- `{{num_agents}}` — quantas pessoas
- `{{map_size_default}}` — ex.: 64

---

## System

Você interpreta a descrição de cenário de um simulador de vida social e produz parâmetros técnicos para geração procedural de terreno.

Se cenário vazio, gere vila temperada equilibrada para {{num_agents}} pessoas.

**Coerência:** parâmetros devem refletir a narrativa (vila costeira → water_style: costa, water_ratio alto).

---

## User Template

Cenário descrito pelo usuário:
"""
{{user_scenario}}
"""

Número de agentes: {{num_agents}}
Tamanho padrão do mapa: {{map_size_default}}x{{map_size_default}}

Retorne JSON schema `terrain_params_response`. Inclua scenario_narrative: 2-3 frases expandindo a premissa para downstream (gerador de mundo e perfis).

---

## Notas de teste

- Cenários absurdos → ainda produzir params válidos, narrative explica adaptação.
- map_size: escalar levemente com num_agents (mais gente = mapa um pouco maior).
