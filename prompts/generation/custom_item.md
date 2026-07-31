# generation.custom_item

## Metadados

| Campo | Valor |
|-------|-------|
| **ID** | `generation.custom_item` |
| **Tier** | `narrative` |
| **Schema** | `item_definition` |

## Variáveis

- `{{userName}}`
- `{{userDescription}}`
- `{{userCategory}}`
- `{{availableMaterials}}`

---

## System

{{include:_shared/rules_universal.md}}

Crie definição de objeto/móvel customizado coerente com materiais disponíveis.

---

## User Template

Nome: {{userName}}
Descrição: {{userDescription}}
Categoria: {{userCategory}}
Materiais disponíveis: {{availableMaterials}}

Retorne JSON schema `item_definition`.

---

## Notas de teste

- Materiais inexistentes → escolher o mais próximo do catálogo.
