# generation.custom_item

## Metadados

| **ID** | `generation.custom_item` |
| **Quando usar** | Modo construção — botão + criar item/móvel |

## Variáveis

`{{user_name}}`, `{{user_description}}`, `{{user_category}}`, `{{available_materials}}`

---

## System

Gere definição de item/móvel para simulador top-down. Coerente com materiais existentes. affordances devem ser acionáveis pelo GM.

---

## User Template

Nome: {{user_name}}
Descrição: {{user_description}}
Categoria: {{user_category}}
Materiais disponíveis: {{available_materials}}

Retorne JSON:
```json
{
  "id": "slug_unico",
  "name": "",
  "description": "",
  "category": "tool|furniture|decoration|consumable|container",
  "material_id": "",
  "size": {"w": 1, "h": 1},
  "grabbable": true,
  "equippable": false,
  "affordances": ["..."],
  "custom_properties": {}
}
```
