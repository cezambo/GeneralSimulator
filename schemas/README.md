# Schemas — Fonte Única dos Contratos

Todo contrato de dados do projeto nasce aqui. Nada de definir a mesma estrutura em dois lugares.

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `domain.schema.json` | Entidades: Agent, Tile, Material, ObjectDef, Opinion, MemoryEntry, Goal, WorldMutation, Generalization, Clock |
| `llm-io.schema.json` | Saída de cada prompt. Referenciado por nome no `prompt_registry.yaml` |
| `protocol.schema.json` | Mensagens WebSocket entre núcleo e clientes |

## O que deriva daqui

1. **Tipos TypeScript** do núcleo e do painel, por geração automática.
2. **Validação em runtime** de toda resposta de LLM e de toda mensagem de protocolo.
3. **O trecho de schema injetado no prompt**, para que o modelo saiba o formato exato esperado.

## Regras

- Prompt nenhum define JSON inline. Referencia um `$defs` de `llm-io.schema.json` pelo nome.
- Variáveis de template em **camelCase**; campos JSON em **camelCase**.
- Schemas removidos no colapso do pipeline: `thought_router_response`, `action_intent_response`, `goal_response`, `goal_reactive_response`.
- `gm_response` inclui `generalization` cross-domain (R-046, B-045).

## Validação

```bash
node scripts/validate-contracts.mjs
```

Verifica registry, arquivos de prompt, schemas referenciados e ausência de `system_rules.md`.

O antigo `prompts/_shared/output_schemas.json` foi removido; era a segunda fonte de verdade que este diretório substitui.
