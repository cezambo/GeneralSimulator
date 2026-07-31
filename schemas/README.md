# Schemas — Fonte Única dos Contratos

Todo contrato de dados do projeto nasce aqui. Nada de definir a mesma estrutura em dois lugares.

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `domain.schema.json` | Entidades: Agent, Tile, Material, ObjectDef, Opinion, MemoryEntry, Goal, WorldMutation, Clock |
| `llm-io.schema.json` | Saída de cada prompt. Referenciado por nome no `prompt_registry.yaml` |
| `protocol.schema.json` | Mensagens WebSocket entre núcleo e clientes |

## O que deriva daqui

1. **Tipos TypeScript** do núcleo e do painel, por geração automática.
2. **Validação em runtime** de toda resposta de LLM e de toda mensagem de protocolo.
3. **O trecho de schema injetado no prompt**, para que o modelo saiba o formato exato esperado.

O cliente Godot não gera tipos — lê dicionários direto do JSON. É cliente fino por decisão (ADR-001), e o núcleo valida tudo que recebe.

## Regra

Prompt nenhum define JSON inline. Se um prompt precisa de um formato de saída, ele referencia um `$defs` de `llm-io.schema.json` pelo nome. Quando o formato muda, muda em um lugar só.

O antigo `prompts/_shared/output_schemas.json` foi removido; era a segunda fonte de verdade que este diretório substitui.
