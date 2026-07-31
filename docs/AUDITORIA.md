# Auditoria do Estado do Projeto

**Data:** 31/07/2026
**Escopo:** tudo produzido até agora (23 arquivos em `prompts/`) cruzado com o PDF de requisitos (17 páginas) e as duas revisões de design feitas em chat.

---

## Resumo em uma frase

A biblioteca de prompts foi bem começada e a abordagem (arquivos editáveis fora do código) está correta, mas **o planejamento nunca foi salvo em disco**, **o registro de prompts está quebrado** (6 entradas sem arquivo) e **falta o classificador de dissonância**, sem o qual três sistemas encadeados do PDF não funcionam.

---

## 1. O que foi suficiente

| Item | Avaliação |
|------|-----------|
| **Prompts como arquivos `.md` editáveis** | Acerto central. Atende diretamente o requisito de ajuste durante testes sem recompilar. |
| **`_shared/system_rules.md` injetado** | Bom padrão. Evita repetir regras globais em 25 arquivos. |
| **Anatomia padrão do prompt** (Metadados / Variáveis / System / Template / Schema / Notas de teste) | Estrutura sólida e consistente em 9 dos 11 arquivos. |
| **Redesenho do GM permissivo** | Melhoria real sobre o PDF. O PDF tinha aprovação binária (§9); o modelo atual (`executed` / `partial` / `reinterpreted` / `denied` + `world_mutations`) resolve o pedido de "quase toda ação possível" e foi propagado corretamente para `evaluate_high`, `evaluate_low` e `system_rules`. |
| **Remoção dos scripts psicóticos** | Feita de forma completa e consistente — não sobrou resíduo em nenhum arquivo. |
| **`output_schemas.json`** | Bem formado, cobre os 8 payloads principais. |
| **Regra de atemporalidade** | Presente e exemplificada onde importa (opiniões, memórias). |

---

## 2. O que não foi suficiente

### 2.1 Crítico — o planejamento não existe em disco

`docs/` está vazia. Todo o documento de 15 seções e a revisão do GM permissivo existem **apenas no histórico de chat**. É o ativo mais valioso do projeto e o mais frágil no momento.

### 2.2 Crítico — falta o classificador de dissonância

O PDF §3.2 exige que toda impressão nova seja comparada com cada opinião existente para decidir **conflito** (vai pro buffer) ou **sinergia** (aumenta o limiar de teimosia). Nenhum prompt faz isso.

A consequência é uma cadeia morta:

```
impressão nova → [classificador AUSENTE] → buffer nunca enche
                                          → ruptura (§3.2) nunca dispara
                                          → reavaliação reativa de metas (§4.2) nunca dispara
```

Ou seja, três sistemas centrais do PDF ficam inertes. `cognition.opinion_burst` existe, mas nada é capaz de chamá-lo.

**Nota de design:** classificar par a par (cada impressão × cada opinião) via LLM fica caro rápido. O correto é uma chamada em lote por agente por evento: manda todas as opiniões + a impressão nova, recebe a lista de conflitos e sinergias de uma vez.

### 2.3 Registro de prompts quebrado

`prompt_registry.yaml` declara 25 prompts. Existem 19 arquivos. **6 entradas apontam para arquivos inexistentes:**

- `agent/action_intent.md`
- `memory/report_vs_log.md`
- `cognition/goal_seasonal.md`
- `cognition/goal_annual.md`
- `social/relocation_vote.md`
- `gm/tactical_options_narration.md`

### 2.4 Prompts exigidos pelo PDF e nem sequer declarados

| Prompt ausente | Origem no PDF | Impacto |
|----------------|---------------|---------|
| **Classificador de dissonância/sinergia** | §3.2 | Crítico (ver 2.2) |
| **Roteador de tipo de pensamento** | linhas 74–79 | O PDF diz que uma *LLM menor decide* se o pensamento é corriqueiro ou aprofundado. O plano trocou isso por seletor estático em código — contradiz o requisito. |
| **Seleção de marcantes (0–5/dia)** | §2.1 | Sem isso a waterfall perde os eventos de alto impacto. |
| **Escolha tática + grito pelo agente** | §6.2 | O registro só tem a *narração* do GM; falta o agente escolher a opção e gritar. |
| **Geração de caprichos (whims)** | §4.1.4 | Camada 4 de motivação não existe. |
| **Deriva de personalidade** | linhas 57–59 | "Experiências repetidas alteram a personalidade" não foi implementado. |
| **Reflexão noturna de opiniões gerais** | §3.3 | Opiniões gerais são processadas em lote noturno; não há prompt. |
| **Resumos quinquenal / decadal / era** | §2.1 níveis 4–6 | Só existem daily/seasonal/annual. |
| **Handshake de conversa** | §5.1 | Checagem de disponibilidade e bloqueadores. |
| **Consolidação noturna da memória do GM** | §9 | GM precisa manter consistência entre dias. |

### 2.5 Mecanismo de template indefinido

`{{include:_shared/system_rules.md}}` aparece em 8 arquivos, mas nada especifica como includes, substituição de variáveis e binding de schema funcionam. Sem contrato de loader, o formato é decorativo.

### 2.6 Binding de modelo na camada errada

O registro fixa `model: gemini-2.0-flash` por prompt. Isso conflita diretamente com o requisito novo (modelo escolhível por nível de pensamento, via menu). Modelo é configuração de runtime que muda toda hora — não pertence ao arquivo de definição do prompt, que muda raramente.

### 2.7 Defeitos pontuais nos arquivos existentes

| Arquivo | Problema |
|---------|----------|
| `cognition/opinion_burst.md` | Vazamento de inglês e erro ortográfico no exemplo: *"alguém fundamentally disonesto"* → deveria ser *"fundamentalmente desonesto"*. Exemplos ruins contaminam a saída do modelo. |
| `memory/seasonal_summary.md`, `memory/annual_summary.md` | Tabela de metadados malformada (sem linha de cabeçalho), fora do padrão dos outros 9 arquivos. |
| `annual_summary`, `goal_reactive`, `custom_item`, `agent_profile`, `meeting_turn` | Definem JSON inline em vez de referenciar `output_schemas.json` — duas fontes de verdade para o mesmo contrato. |
| `seasonal_summary`, `annual_summary`, `goal_reactive`, `meeting_turn`, `custom_item` | Sem seção "Notas de teste", que o README promete como padrão. |

---

## 3. Contagem de cobertura

| Área do PDF | Prompts necessários | Existentes | Cobertura |
|-------------|--------------------|-----------|-----------|
| Geração de mundo | 4 | 4 | 100% |
| Pensamento do agente | 5 | 3 | 60% |
| Memória (waterfall) | 7 | 3 | 43% |
| Opiniões e metas | 7 | 3 | 43% |
| Social | 4 | 2 | 50% |
| Comunidade | 2 | 2 | 100% |
| GM | 4 | 2 | 50% |
| Combate | 2 | 0 | 0% |
| **Total** | **35** | **19** | **54%** |

O número de prompts necessários subiu de 25 (registro atual) para ~35 depois de mapear o PDF linha a linha.

---

## 4. Riscos que a auditoria revelou

1. **Prompts escritos para o modelo forte, testados no fraco.** O usuário vai testar com open-weights baratos. Modelos pequenos falham em JSON longo e nuançado. Os prompts atuais assumem competência alta. Precisam ser escritos para o *tier mais fraco* em que rodarão, com schemas curtos e passe de reparo.

2. **Custo por evento social não foi dimensionado.** Uma conversa de 5 turnos entre 3 agentes = 15 chamadas de turno + 3 pós-conversa + 3 classificações de dissonância = 21 chamadas para um único evento. Com 10 agentes conversando ao longo de um dia, isso explode.

3. **Sem replay determinístico, comportamento emergente é indepurável.** Se no dia 7 um agente faz algo inesperado, não há como reproduzir. Gravação e replay de chamadas LLM precisa entrar cedo, não como polimento.

---

## 5. Veredito

O que existe é uma base parcial boa de uma das camadas (prompts, 54% de cobertura), sem a espinha dorsal (especificação persistida, contratos de dados, mecanismo de carregamento) e com um buraco funcional que trava três sistemas encadeados.

A correção não é escrever mais prompts primeiro — é estabelecer a estrutura que dá rastreabilidade e depois preencher. Ver `02-ARQUITETURA.md`.
