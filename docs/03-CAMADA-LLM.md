# Camada LLM — Provider-Agnostic com OpenRouter

**Requisito:** poder escolher qualquer modelo de qualquer provedor para cada nível de pensamento, configurável por menu na UI, com as opções aparecendo dinamicamente na seleção. Testes com open-weights baratos, eventualmente APIs fechadas.

---

## 1. Princípio

Nenhum modelo é mencionado em código ou em arquivo de prompt. Prompts declaram **capacidades necessárias**; a UI atribui **modelos concretos** a **tiers**; o roteador resolve na hora da chamada.

```
prompt  ──declara──►  tier + capacidades exigidas
                              │
config/models.json  ──vincula──►  modelo + provedor + parâmetros
                              │
roteador  ──resolve──►  chamada HTTP (OpenRouter ou API direta)
```

Trocar o modelo de todos os pensamentos corriqueiros é editar um campo num menu — nenhum arquivo de prompt muda.

---

## 2. Tiers (níveis de pensamento)

Cada tier é uma linha no menu de configuração, com seu próprio modelo.

| Tier | Papel | Capacidades exigidas | Perfil desejado |
|------|-------|---------------------|-----------------|
| `instinct` | ROLE_BASE_LOW — dor, pânico, consciência < 0.70 | JSON estruturado | ultra-rápido e barato; qualidade baixa é aceitável e até desejável |
| `standard` | ROLE_BASE_HIGH — rotina, social casual | JSON estruturado | coerência de persona; o cavalo de batalha, maior volume de chamadas |
| `deep` | ROLE_REASONING — reuniões, dilemas morais, ações irreversíveis | JSON estruturado + reasoning | raciocínio longo; volume baixo |
| `archivist` | ROLE_SUMMARIZER — waterfall de memória | JSON estruturado + contexto ≥ 128k | síntese e abstração; roda em lote noturno |
| `gm_fast` | GM em ações triviais | JSON estruturado | latência mínima; altíssimo volume |
| `gm_deep` | GM em combate, sabotagem, consequências | JSON estruturado | consistência causal |
| `builder` | geração agentica do mundo | JSON estruturado + tool calling | só no pré-jogo |
| `utility` | classificadores e roteadores (dissonância, tipo de pensamento, marcantes) | JSON estruturado, saída curta | o mais barato possível; volume altíssimo |

`utility` é o tier de maior volume do sistema inteiro — classificação de dissonância roda a cada impressão de cada agente. Tratar como tier separado do `instinct` é o que permite otimizar custo sem degradar comportamento.

---

## 3. Catálogo dinâmico do OpenRouter

Verificado em 31/07/2026 contra a API real:

| Endpoint | Retorno | Uso |
|----------|---------|-----|
| `GET /api/v1/models` | 364 modelos | popular o seletor |
| `GET /api/v1/providers` | 100 provedores | filtro de provedor |
| `GET /api/v1/models/{author}/{slug}/endpoints` | provedores que servem aquele modelo, com preço e contexto individuais | sub-seletor de provedor |

Campos relevantes de cada modelo:

```
id                      → slug usado na chamada  (ex: "openai/gpt-oss-20b")
name                    → nome de exibição
context_length          → filtro para o tier archivist
pricing.prompt          → US$ por token de entrada
pricing.completion      → US$ por token de saída
pricing.input_cache_read → leitura de cache (relevante: system prompt é repetido)
architecture.input_modalities
supported_parameters[]  → capacidades reais
reasoning.supported_efforts
top_provider.max_completion_tokens
```

Distribuição de capacidades no catálogo atual:

| Capacidade | Modelos |
|------------|---------|
| `structured_outputs` | 289 |
| `response_format` | 312 |
| `reasoning` | 237 |
| `tools` | 298 |
| gratuitos (preço de entrada = 0) | 17 |

### Filtro obrigatório

Todo prompt deste projeto retorna JSON. O seletor **esconde por padrão** modelos sem `structured_outputs` nem `response_format`, com um toggle "mostrar incompatíveis" para experimentação.

---

## 4. Opções baratas para teste

Amostra real do catálogo, ordenada por preço, já filtrada por `structured_outputs`:

| Modelo | Entrada (US$/M) | Saída (US$/M) | Contexto |
|--------|----------------|---------------|----------|
| `openai/gpt-oss-20b:free` | 0 | 0 | 131k |
| `google/gemma-4-26b-a4b-it:free` | 0 | 0 | 262k |
| `nvidia/nemotron-nano-9b-v2:free` | 0 | 0 | 128k |
| `nvidia/nemotron-3-super-120b-a12b:free` | 0 | 0 | 262k |
| `inclusionai/ling-2.6-flash` | 0,01 | 0,03 | 262k |
| `mistralai/mistral-nemo` | 0,019 | 0,03 | 131k |
| `nex-agi/nex-n2-mini` | 0,025 | 0,10 | 262k |
| `openai/gpt-oss-20b` | 0,03 | 0,13 | 131k |

Existe também `nvidia/nemotron-3-ultra-550b-a55b:free` com 1M de contexto — candidato ao tier `archivist` em testes.

Preços mudam; o número exibido na UI vem sempre do catálogo ao vivo, nunca de tabela fixa.

---

## 5. Formato de `config/models.json`

```jsonc
{
  "version": 1,
  "activePreset": "teste-barato",

  "providers": {
    "openrouter": {
      "type": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "headers": { "HTTP-Referer": "...", "X-Title": "Simulador de Interações" }
    },
    "anthropic-direto": {
      "type": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  },

  "presets": {
    "teste-barato": {
      "description": "Tudo em open-weights gratuitos ou quase.",
      "bindings": {
        "utility":   { "provider": "openrouter", "model": "openai/gpt-oss-20b:free",        "temperature": 0.2, "maxTokens": 300 },
        "instinct":  { "provider": "openrouter", "model": "openai/gpt-oss-20b:free",        "temperature": 1.0, "maxTokens": 400 },
        "standard":  { "provider": "openrouter", "model": "google/gemma-4-26b-a4b-it:free", "temperature": 0.85, "maxTokens": 800 },
        "deep":      { "provider": "openrouter", "model": "nvidia/nemotron-3-super-120b-a12b:free", "temperature": 0.8, "maxTokens": 2000, "reasoningEffort": "medium" },
        "archivist": { "provider": "openrouter", "model": "nvidia/nemotron-3-ultra-550b-a55b:free", "temperature": 0.6, "maxTokens": 1500 },
        "gm_fast":   { "provider": "openrouter", "model": "openai/gpt-oss-20b:free",        "temperature": 0.3, "maxTokens": 500 },
        "gm_deep":   { "provider": "openrouter", "model": "google/gemma-4-26b-a4b-it:free", "temperature": 0.5, "maxTokens": 1200 },
        "builder":   { "provider": "openrouter", "model": "openai/gpt-oss-20b",             "temperature": 0.7, "maxTokens": 1500 }
      }
    },

    "qualidade": {
      "description": "Modelos fortes para rodadas de avaliação narrativa.",
      "bindings": { }
    }
  },

  "overrides": {
    "_comment": "Exceção por prompt específico, sobrepõe o tier. Usar com parcimônia.",
    "cognition.opinion_burst": { "provider": "openrouter", "model": "anthropic/claude-opus-5", "temperature": 0.9 }
  },

  "routing": {
    "providerOrder": [],
    "allowFallbacks": true,
    "requireStructuredOutputs": true
  },

  "budget": {
    "dailyUsdLimit": 5.0,
    "perAgentPerDayCallLimit": 20,
    "onExceed": "degrade"
  }
}
```

Três níveis de resolução, do mais específico ao mais geral: `overrides[prompt_id]` → `presets[ativo].bindings[tier]` → erro de configuração.

**Presets** são o recurso mais útil no dia a dia: alternar a simulação inteira entre "teste barato" e "qualidade" num clique, sem reconfigurar oito campos.

---

## 6. UI — menu de configuração de modelos

```
┌─ Configuração de Modelos ─────────────────────────────────────────────┐
│                                                                       │
│  Preset: [ teste-barato ▼ ]     [Duplicar]  [Salvar como…]           │
│  Chave OpenRouter: •••••••••••  [Testar conexão]   Saldo: US$ 12,40  │
│                                                                       │
│  ┌───────────┬──────────────────────────┬──────────┬───────┬───────┐ │
│  │ Tier      │ Modelo                   │ Provedor │ Temp  │ US$/M │ │
│  ├───────────┼──────────────────────────┼──────────┼───────┼───────┤ │
│  │ utility   │ [gpt-oss-20b:free    ▼]  │ [auto ▼] │ 0.2   │ 0,00  │ │
│  │ instinct  │ [gpt-oss-20b:free    ▼]  │ [auto ▼] │ 1.0   │ 0,00  │ │
│  │ standard  │ [gemma-4-26b:free    ▼]  │ [auto ▼] │ 0.85  │ 0,00  │ │
│  │ deep      │ [nemotron-3-super    ▼]  │ [auto ▼] │ 0.8   │ 0,00  │ │
│  │ archivist │ [nemotron-3-ultra    ▼]  │ [auto ▼] │ 0.6   │ 0,00  │ │
│  │ gm_fast   │ [gpt-oss-20b:free    ▼]  │ [auto ▼] │ 0.3   │ 0,00  │ │
│  │ gm_deep   │ [gemma-4-26b:free    ▼]  │ [auto ▼] │ 0.5   │ 0,00  │ │
│  │ builder   │ [gpt-oss-20b         ▼]  │ [auto ▼] │ 0.7   │ 0,03  │ │
│  └───────────┴──────────────────────────┴──────────┴───────┴───────┘ │
│                                                                       │
│  Custo projetado: US$ 0,00 / dia simulado  (10 agentes)              │
│                                                                       │
│  [ ] Mostrar modelos sem suporte a JSON estruturado                  │
│  Modo LLM: ( ) Live  (•) Híbrido  ( ) Replay                         │
└───────────────────────────────────────────────────────────────────────┘
```

### Comportamento do seletor de modelo

Ao abrir o dropdown de um tier:

1. Busca `/api/v1/models` (cache de 1h, botão de atualizar).
2. Filtra pelas capacidades exigidas por aquele tier — `deep` só mostra modelos com `reasoning`; `archivist` só mostra contexto ≥ 128k; `builder` só com `tools`.
3. Ordena por preço crescente por padrão, com alternância para nome ou contexto.
4. Cada linha mostra: nome, preço de entrada/saída por milhão, contexto, ícones de capacidade.
5. Campo de busca por texto livre.
6. Agrupamento por autor (`openai/`, `google/`, `anthropic/`, …).

### Sub-seletor de provedor

Escolhido o modelo, o dropdown de provedor consulta `/api/v1/models/{id}/endpoints`. Um mesmo modelo costuma ter vários provedores com preço e latência distintos — `openai/gpt-oss-20b` tem 12, variando de US$ 0,03 a 0,07 por milhão de entrada.

Opções: `auto` (OpenRouter decide), provedor específico, ou lista ordenada de preferência com fallback. Vira `provider: { order: [...], allow_fallbacks: bool }` no corpo da requisição.

---

## 7. Contrato do roteador

```typescript
interface LlmRequest {
  promptId: string;          // "agent.thought.base_high"
  tier: Tier;                // resolvido pelo registro do prompt
  variables: Record<string, unknown>;
  schemaRef: string;         // nome em schemas/
  agentId?: string;          // para budget e trace
}

interface LlmResponse<T> {
  data: T;                   // já validado contra o schema
  raw: string;
  meta: {
    model: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
    repairAttempts: number;
    fromCassette: boolean;
  };
}
```

Responsabilidades do roteador, em ordem:

1. Resolver binding (override → preset → tier)
2. Renderizar o prompt (includes + variáveis + trecho de schema)
3. Consultar cassete se o modo permitir
4. Checar budget
5. Chamar a API com `response_format` de JSON structured output
6. Validar contra o schema
7. Reparar se inválido (até 2 tentativas)
8. Gravar cassete e trace
9. Contabilizar custo

---

## 8. Resiliência com modelos fracos

Consequência direta de testar com open-weights baratos: **os prompts precisam ser escritos para o tier mais fraco em que vão rodar**, não para o mais forte.

| Problema | Mitigação |
|----------|-----------|
| JSON inválido | `response_format` nativo; passe de reparo com a mensagem do validador; no fim, fallback heurístico |
| Ignora instruções longas | System curto, campos poucos, exemplo de saída embutido |
| Vaza inglês ou quebra persona | Regra de idioma no system + exemplos em português (e corrigir o vazamento já detectado em `opinion_burst.md`) |
| Escreve demais | `maxTokens` por tier + limite explícito de frases no prompt |
| Ignora atemporalidade | Exemplo negativo e positivo lado a lado, como já feito |

Cada prompt declara `min_tier_testado` — registra em qual modelo mais fraco já se comprovou funcional.

---

## 9. Cassetes e determinismo

```
cassettes/
└── run-2026-07-31-a3f/
    ├── manifest.json      ← seed, preset, versão dos prompts
    └── calls/
        └── {hash}.json    ← requisição + resposta + meta
```

Hash = SHA de (promptId + variáveis renderizadas + binding). Trocar o prompt invalida naturalmente os cassetes afetados e preserva o resto.

Isso é o que torna possível responder "por que o agente fez aquilo no dia 7" e rodar regressão de cognição sem custo.

---

## 10. Controle de custo

Com preço vindo do catálogo, dá para estimar antes de rodar. O cálculo por dia simulado é dominado por três termos:

```
custo_dia ≈  agentes × chamadas_pensamento_por_dia × custo(standard)
           + eventos_sociais × turnos × participantes × custo(standard)
           + impressões × custo(utility)
           + agentes × custo(archivist)
```

O termo social é o que explode: uma conversa de 5 turnos entre 3 agentes gera 15 chamadas de turno, 3 pós-conversa e 3 classificações de dissonância — 21 chamadas para um único evento.

Mitigações, em ordem de aplicação: cache de leitura no system prompt (o catálogo expõe `input_cache_read`, tipicamente 10× mais barato), classificação de dissonância em lote (uma chamada por agente por evento, não uma por par), sumarização noturna agrupada, teto de chamadas por agente por dia, e degradação para heurística quando o teto estoura.

O painel mostra custo acumulado da sessão, custo por dia simulado e projeção — sempre em dólar real, calculado a partir do preço vigente do modelo escolhido.
